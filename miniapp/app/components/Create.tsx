'use client';

import { useState, useEffect } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { ENB_MINI_APP_ABI, ENB_MINI_APP_ADDRESS } from '../constants/enbMiniAppAbi';
import { API_BASE_URL } from '../config';
import { createWalletClient, custom, createPublicClient, http, encodeFunctionData } from 'viem';
import { base } from 'viem/chains'; // Changed from mainnet to base
import { getReferralTag, submitReferral } from '@divvi/referral-sdk';

// Divvi configuration
const DIVVI_CONFIG = {
  consumer: '0xaF108Dd1aC530F1c4BdED13f43E336A9cec92B44',
  providers: ['0x0423189886d7966f0dd7e7d256898daeee625dca','0xc95876688026be9d6fa7a7c33328bd013effa2bb'],
};

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
  const [hasUnactivatedAccount, setHasUnactivatedAccount] = useState(false);
  const [activationCode, setActivationCode] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [activationSuccessful, setActivationSuccessful] = useState(false);
  const [isCheckingAccount, setIsCheckingAccount] = useState(true);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

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

          if (user) {
            if (user.isActivated) {
              // User has an activated account - should redirect to main app
              setAccountCreated(true);
            } else {
              // User has an account but it's not activated
              setHasUnactivatedAccount(true);
            }
          }
          // If no user found, show create account option
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

    setIsCreatingAccount(true);
    let txHash: string;

    try {
      // Create public client for gas estimation and wallet client for Divvi
      const publicClient = createPublicClient({
        chain: base,
        transport: http(),
      });

      // Prepare base transaction data
      const baseTxData = encodeFunctionData({
        abi: ENB_MINI_APP_ABI,
        functionName: 'createAccount',
        args: [address],
      });

      // DIVVI INTEGRATION: Setup referral tracking
      let finalTxData = baseTxData;
      let walletClient = null;

      try {
        console.log('Setting up Divvi referral tracking...');
        
        // Create wallet client for Divvi
        walletClient = createWalletClient({
          chain: base, // Use base chain instead of mainnet
          transport: custom(window.ethereum as unknown as import('viem').EIP1193Provider),
        });

        // Generate referral tag
        const referralTag = getReferralTag({
          user: address,
          consumer: DIVVI_CONFIG.consumer,
          providers: DIVVI_CONFIG.providers,
        });

        // Append referral data to transaction data
        finalTxData = baseTxData + referralTag;
        console.log('Divvi referral data added to transaction');
      } catch (divviError) {
        console.warn('Divvi referral setup failed, proceeding without referral tracking:', divviError);
        // Continue with original transaction data if Divvi fails
      }

      // Get gas estimate with final transaction data
      console.log('Estimating gas...');
      let gasEstimate;
      try {
        gasEstimate = await publicClient.estimateGas({
          account: address,
          to: ENB_MINI_APP_ADDRESS,
          data: finalTxData
        });
        console.log('Gas estimate:', gasEstimate.toString());
      } catch (gasError) {
        console.warn('Gas estimation failed, using default:', gasError);
        gasEstimate = BigInt(100000); // Default gas limit
      }

      // Send transaction with custom data
      if (window.ethereum) {
        const txParams = {
          from: address,
          to: ENB_MINI_APP_ADDRESS,
          data: finalTxData,
          gas: `0x${gasEstimate.toString(16)}`
        };

        console.log('Sending transaction with Divvi data...');
        txHash = await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [txParams]
        });
      } else {
        // Fallback to regular writeContract if window.ethereum is not available
        console.log('Using fallback writeContract method...');
        txHash = await writeContractAsync({
          address: ENB_MINI_APP_ADDRESS,
          abi: ENB_MINI_APP_ABI,
          functionName: 'createAccount',
          args: [address],
        });
      }

      console.log('Transaction sent:', txHash);

      // DIVVI INTEGRATION: Submit referral after transaction is sent
      if (walletClient && finalTxData !== baseTxData) {
        try {
          console.log('Submitting referral to Divvi...');
          const chainId = await walletClient.getChainId();
          await submitReferral({
            txHash,
            chainId,
          });
          console.log('Referral submitted to Divvi successfully');
        } catch (divviSubmissionError) {
          console.warn('Failed to submit referral to Divvi:', divviSubmissionError);
          // Don't fail the entire transaction if Divvi submission fails
        }
      }

      alert('Transaction sent. Waiting for confirmation...');
    } catch (error) {
      console.error('Blockchain transaction error:', error);
      alert('Blockchain transaction failed');
      setIsCreatingAccount(false);
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
      setHasUnactivatedAccount(true); // Account created but needs activation
    } catch (error) {
      console.error('Backend sync error:', error);
      // Since blockchain succeeded but backend failed, still set account as created
      alert('Account created.');
      setAccountCreated(true); // Still proceed since blockchain part worked
      setHasUnactivatedAccount(true); // Account created but needs activation
    } finally {
      setIsCreatingAccount(false);
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

        {!accountCreated && !hasUnactivatedAccount ? (
          <div className="space-y-4">
            <p>Create your mining account to start earning ENB</p>
            <button
              onClick={handleCreateAccount}
              disabled={isCreatingAccount}
              className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
            >
              {isCreatingAccount ? 'Creating Account...' : 'Create Mining Account'}
            </button>
          </div>
        ) : hasUnactivatedAccount ? (
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
        ) : (
          <div className="space-y-4">
            <p className="text-green-600">Your account is already activated!</p>
            <p className="text-sm text-gray-600">You should be redirected to the main app.</p>
          </div>
        )}
      </div>
    </div>
  );
}