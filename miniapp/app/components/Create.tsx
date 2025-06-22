'use client';

import { useState, useEffect } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { ENB_MINI_APP_ABI, ENB_MINI_APP_ADDRESS } from '../constants/enbMiniAppAbi';
import { API_BASE_URL } from '../config';

interface CreateProps {
  refreshUserAccountAction: () => Promise<void>;
}

interface User {
  walletAddress: string;
  isActivated: boolean;
}

export function Create({ refreshUserAccountAction }: CreateProps) {
  const { address } = useAccount();
  const [accountCreated, setAccountCreated] = useState(false);
  const [activationCode, setActivationCode] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [activationSuccessful, setActivationSuccessful] = useState(false);
  const [isCheckingAccount, setIsCheckingAccount] = useState(true);

  const { writeContractAsync } = useWriteContract();

  // Check if user has an account that needs activation
  useEffect(() => {
    const checkExistingAccount = async () => {
      if (!address) {
        setIsCheckingAccount(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/users?limit=1000`);
        
        if (response.ok) {
          const data = await response.json();
          const user = data.users.find((u: User) => 
            u.walletAddress.toLowerCase() === address.toLowerCase()
          );

          if (user && !user.isActivated) {
            // User has an account but it's not activated
            setAccountCreated(true);
          }
        }
      } catch (error) {
        console.error('Error checking existing account:', error);
      } finally {
        setIsCheckingAccount(false);
      }
    };

    checkExistingAccount();
  }, [address]);

  const handleCreateAccount = async () => {
    if (!address) {
      alert('Please connect your wallet');
      return;
    }
  
    let txHash: string;
  
    try {
      // Send transaction first
      txHash = await writeContractAsync({
        address: ENB_MINI_APP_ADDRESS,
        abi: ENB_MINI_APP_ABI,
        functionName: 'createAccount',
        args: [address],
      });
  
      alert('Transaction sent. Waiting for confirmation...');
    } catch (error) {
      console.error('Blockchain transaction error:', error);
      alert('Blockchain transaction failed');
      return; // Exit early if blockchain fails
    }
  
    // If we get here, blockchain transaction succeeded
    try {
      // Continue with backend sync
      const response = await fetch(`${API_BASE_URL}/api/create-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          transactionHash: txHash,
        }),
      });
  
      if (!response.ok) {
        throw new Error('Failed to register account with backend');
      }
  
      alert('Account created and synced with backend!');
      setAccountCreated(true);
    } catch (error) {
      console.error('Backend sync error:', error);
      // Since blockchain succeeded but backend failed, still set account as created
      alert('Account created on blockchain, but backend sync failed. You may need to refresh the page.');
      setAccountCreated(true); // Still proceed since blockchain part worked
    }
  };

  const handleActivateAccount = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!address || !activationCode.trim()) {
      alert('Please enter a valid invitation code');
      return;
    }

    setIsActivating(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/activate-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          invitationCode: activationCode.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Activation failed');
      }

      alert('Account activated! Membership level: ' + data.membershipLevel);
      setActivationSuccessful(true);
      
      // Wait a moment for the success message to show, then refresh user account
      setTimeout(async () => {
        await refreshUserAccountAction();
      }, 2000);
    } catch (err: unknown) {
      console.error('Activation error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to activate account';
      alert(errorMessage);
    } finally {
      setIsActivating(false);
    }
  };

  // Show loading while checking account status
  if (isCheckingAccount) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="text-center space-y-4">
          <h1 className="text-xl font-bold">Welcome To ENB Mini App</h1>
          <p className="text-gray-600">Checking your account status...</p>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      </div>
    );
  }

  // If activation was successful, show a success message and trigger redirect
  if (activationSuccessful) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="text-center space-y-4">
          <h1 className="text-xl font-bold text-green-600">Account Activated Successfully!</h1>
          <p className="text-gray-600">Redirecting to your account...</p>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Welcome To ENB Mini App</h1>

        {!accountCreated ? (
          <div className="space-y-4">
            <p>Create your mining account to start earning ENB</p>
            <button
              onClick={handleCreateAccount}
              className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              Create Mining Account
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p>Please activate your account using an invitation code</p>
            <p className="text-sm text-gray-600">
              Each invitation code can only be used 5 times in 24 hours
            </p>
            <form onSubmit={handleActivateAccount} className="space-y-4">
              <div>
                <input
                  type="text"
                  value={activationCode}
                  onChange={(e) => setActivationCode(e.target.value)}
                  placeholder="Enter invitation code"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <button
                type="submit"
                disabled={isActivating}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {isActivating ? 'Activating...' : 'Activate Account'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}