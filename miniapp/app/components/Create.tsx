'use client';

import { useState, useEffect } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { ENB_MINI_APP_ABI, ENB_MINI_APP_ADDRESS } from '../constants/enbMiniAppAbi';
import { API_BASE_URL } from '../config';
import { createWalletClient, custom } from 'viem';
import { mainnet } from 'viem/chains';

// Type definitions for Divvi SDK
interface ReferralTagParams {
  user: string;
  consumer: string;
  providers: string[];
}

interface SubmitReferralParams {
  txHash: string;
  chainId: number;
}

type GetReferralTagFunction = (params: ReferralTagParams) => string;
type SubmitReferralFunction = (params: SubmitReferralParams) => Promise<void>;

// Dynamic import with proper typing
let getReferralTag: GetReferralTagFunction | null = null;
let submitReferral: SubmitReferralFunction | null = null;

// Async function to load Divvi SDK
const loadDivviSDK = async () => {
  try {
    const divviModule = await import('@divvi/referral-sdk');
    getReferralTag = divviModule.getReferralTag;
    submitReferral = divviModule.submitReferral;
    return true;
  } catch (error) {
    console.warn('Divvi SDK not available:', error);
    return false;
  }
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
  
    let txHash: string;
    let referralTag: string = '';
  
    try {
      // Step 1: Load Divvi SDK and create wallet client if available
      const divviLoaded = await loadDivviSDK();
      let walletClient = null;
      
      if (divviLoaded && getReferralTag && submitReferral) {
        try {
          walletClient = createWalletClient({
            chain: mainnet,
            transport: custom(window.ethereum as any),
          });

          // Step 2: Generate referral tag
          referralTag = getReferralTag({
            user: address, // The user address making the transaction
            consumer: '0xaF108Dd1aC530F1c4BdED13f43E336A9cec92B44', // Your Divvi Identifier
            providers: ['0x0423189886d7966f0dd7e7d256898daeee625dca','0xc95876688026be9d6fa7a7c33328bd013effa2bb'], // Array of campaigns that you signed up for
          });
        } catch (referralError) {
          console.warn('Failed to generate referral tag:', referralError);
          // Continue without referral tag if generation fails
        }
      } else {
        console.warn('Divvi SDK not available, continuing without referral tracking');
      }

      // Step 3: Send transaction
      interface ContractArgs {
        address: string;
        abi: typeof ENB_MINI_APP_ABI;
        functionName: string;
        args: string[];
        dataSuffix?: string;
      }

      const contractArgs: ContractArgs = {
        address: ENB_MINI_APP_ADDRESS,
        abi: ENB_MINI_APP_ABI,
        functionName: 'createAccount',
        args: [address],
      };

      // Add referral tag as dataSuffix if available
      if (referralTag) {
        contractArgs.dataSuffix = `0x${referralTag}`;
      }

      txHash = await writeContractAsync(contractArgs);

      // Step 4: Submit referral to Divvi if available and referral tag was generated
      if (referralTag && submitReferral && walletClient) {
        try {
          const chainId = await walletClient.getChainId();
          await submitReferral({
            txHash,
            chainId,
          });
          console.log('Referral submitted to Divvi successfully');
        } catch (referralSubmissionError) {
          console.warn('Failed to submit referral to Divvi:', referralSubmissionError);
          // Don't fail the main transaction if referral submission fails
        }
      }
  
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
      setHasUnactivatedAccount(true); // Account created but needs activation
    } catch (error) {
      console.error('Backend sync error:', error);
      // Since blockchain succeeded but backend failed, still set account as created
      alert('Account created.');
      setAccountCreated(true); // Still proceed since blockchain part worked
      setHasUnactivatedAccount(true); // Account created but needs activation
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
              className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              Create Mining Account
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