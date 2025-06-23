'use client';

import {
  useMiniKit,
  useAddFrame,
} from "@coinbase/onchainkit/minikit";
import { useEffect, useMemo, useState, useCallback } from "react";
import { Button } from "./components/Button";
import { Icon } from "./components/Icon";
import { Account } from "./components/Account";
import { Create } from "./components/Create";
import { useAccount, useConnect } from "wagmi";
import { farcasterFrame } from '@farcaster/frame-wagmi-connector';
import Image from "next/image";
import { API_BASE_URL } from './config';

interface User {
  id: string;
  walletAddress: string;
  membershipLevel: string;
  invitationCode: string | null;
  enbBalance: number;
  totalEarned: number;
  consecutiveDays: number;
  isActivated: boolean;
  createdAt: string;
  activatedAt?: string;
  lastCheckIn?: string;
}

interface ApiError {
  error: string;
  message?: string;
}

type ProfileState = 'loading' | 'not-found' | 'found' | 'error';

export default function App() {
  const { setFrameReady, isFrameReady, context } = useMiniKit();
  const [frameAdded, setFrameAdded] = useState(false);
  const { isConnected, address } = useAccount();
  const { connect } = useConnect();

  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [profileState, setProfileState] = useState<ProfileState>('loading');
  const [apiError, setApiError] = useState<string | null>(null);

  const { addFrame } = useAddFrame();
  const frameConnector = useMemo(() => farcasterFrame(), []);

  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

  useEffect(() => {
    const autoConnect = async () => {
      try {
        if (!isConnected) {
          await connect({ connector: frameConnector });
        }
      } catch (error) {
        console.error("Auto-connect failed:", error);
      }
    };
    autoConnect();
  }, [isConnected, connect, frameConnector]);

  const fetchUserProfile = useCallback(async (walletAddress: string) => {
    if (!walletAddress) {
      setUserProfile(null);
      setProfileState('not-found');
      setApiError(null);
      return;
    }

    setProfileState('loading');
    setApiError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/profile/${walletAddress}`);
      if (response.status === 404) {
        setUserProfile(null);
        setProfileState('not-found');
        return;
      }

      if (!response.ok) {
        const errorData: ApiError = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(errorData.message || errorData.error || 'Failed to fetch profile');
      }

      const profileData: User = await response.json();
      
      // Ensure isActivated is properly converted to boolean
      const normalizedProfile: User = {
        ...profileData,
        isActivated: Boolean(profileData.isActivated)
      };
      
      console.log('Profile fetched:', normalizedProfile);
      console.log('isActivated value:', normalizedProfile.isActivated, typeof normalizedProfile.isActivated);
      
      setUserProfile(normalizedProfile);
      setProfileState('found');
    } catch (error) {
      console.error('Error fetching user profile:', error);
      setApiError(error instanceof Error ? error.message : 'Unknown error occurred');
      setUserProfile(null);
      setProfileState('error');
    }
  }, []);

  useEffect(() => {
    if (address) {
      fetchUserProfile(address);
    } else {
      setUserProfile(null);
      setProfileState('loading');
      setApiError(null);
    }
  }, [address, fetchUserProfile]);

  const refreshUserProfile = useCallback(async () => {
    if (address) {
      await fetchUserProfile(address);
    }
  }, [address, fetchUserProfile]);

  const handleAddFrame = useCallback(async () => {
    try {
      const frameAdded = await addFrame({ 
        id: 'enbminiapp',
        title: 'ENB Mini App',
        description: 'Mine ENB Daily',
        image: process.env.NEXT_PUBLIC_ICON_URL || '',
      });
      setFrameAdded(Boolean(frameAdded));
    } catch (error) {
      console.error("Failed to add frame:", error);
    }
  }, [addFrame]);

  const saveFrameButton = useMemo(() => {
    if (context && !context.client.added) {
      return (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleAddFrame}
          className="text-[var(--app-accent)] p-4"
          icon={<Icon name="plus" size="sm" />}
        >
          Save Frame
        </Button>
      );
    }

    if (frameAdded) {
      return (
        <div className="flex items-center space-x-1 text-sm font-medium text-[#0052FF] animate-fade-out">
          <Icon name="check" size="sm" className="text-[#0052FF]" />
          <span>Saved</span>
        </div>
      );
    }

    return null;
  }, [context, frameAdded, handleAddFrame]);

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const renderMainComponent = () => {
    console.log('=== RENDER DEBUG ===');
    console.log('isConnected:', isConnected);
    console.log('address:', address);
    console.log('profileState:', profileState);
    console.log('userProfile:', userProfile);
    console.log('userProfile?.isActivated:', userProfile?.isActivated);
    console.log('==================');

    // Step 1: Check wallet connection
    if (!isConnected || !address) {
      return (
        <div className="flex justify-center items-center py-20">
          <div className="text-center">
            <p className="text-gray-600 mb-4">Connecting wallet...</p>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        </div>
      );
    }

    // Step 2: Check if still loading profile
    if (profileState === 'loading') {
      return (
        <div className="flex justify-center items-center py-20">
          <div className="text-center">
            <p className="text-gray-600 mb-4">Loading profile...</p>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        </div>
      );
    }

    // Step 3: Handle API errors
    if (profileState === 'error') {
      return (
        <div className="flex justify-center items-center py-20">
          <div className="text-center">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-sm mx-auto">
              <Icon name="arrow-right" size="lg" className="text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-red-800 mb-2">Error Loading Profile</h3>
              <p className="text-red-600 text-sm mb-4">{apiError}</p>
              <Button 
                onClick={() => fetchUserProfile(address)} 
                variant="ghost" 
                size="sm"
                className="text-red-600 hover:text-red-700"
              >
                Try Again
              </Button>
            </div>
          </div>
        </div>
      );
    }

    // Step 4: Handle case where no profile exists (404) - show Create component
    if (profileState === 'not-found') {
      console.log('Profile not found - showing Create component');
      return <Create refreshUserAccountAction={refreshUserProfile} />;
    }

    // Step 5: Handle case where profile exists - check activation status
    if (profileState === 'found') {
      if (!userProfile) {
        console.log('ERROR: profileState is "found" but userProfile is null');
        return (
          <div className="flex justify-center items-center py-20">
            <div className="text-center">
              <p className="text-red-500">Profile state error</p>
              <Button onClick={() => fetchUserProfile(address)} className="mt-2">
                Retry
              </Button>
            </div>
          </div>
        );
      }

      // Explicitly check if account exists AND is activated
      const hasAccount = Boolean(userProfile);
      const isActivated = Boolean(userProfile.isActivated);
      
      console.log('Account check - hasAccount:', hasAccount, 'isActivated:', isActivated);
      console.log('Raw isActivated value:', userProfile.isActivated, 'type:', typeof userProfile.isActivated);
      
      // Only show Account component if BOTH conditions are met:
      // 1. Account exists (we already know this from profileState === 'found')
      // 2. Account is activated
      if (hasAccount && isActivated) {
        console.log('✅ Account exists AND is activated - rendering Account component');
        return <Account userProfile={userProfile} />;
      } else {
        console.log('❌ Account exists but is NOT activated - rendering Create component');
        return <Create refreshUserAccountAction={refreshUserProfile} />;
      }
    }

    // Step 6: Fallback for unexpected states
    console.log('UNEXPECTED STATE - This should not happen');
    return (
      <div className="flex justify-center items-center py-20">
        <div className="text-center">
          <p className="text-gray-500">Unexpected application state</p>
          <div className="text-xs text-gray-400 mt-2 p-2 bg-gray-100 rounded">
            <div>State: {profileState}</div>
            <div>Profile exists: {userProfile ? 'Yes' : 'No'}</div>
            <div>Is activated: {userProfile?.isActivated?.toString()}</div>
          </div>
          <Button 
            onClick={() => fetchUserProfile(address)} 
            className="mt-4"
            size="sm"
          >
            Refresh Profile
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-screen font-sans text-[var(--app-foreground)] mini-app-theme from-[var(--app-background)] to-[var(--app-gray)]">
      <header className="fixed top-0 left-0 right-0 bg-[var(--app-background)] border-b border-[var(--app-gray)] z-50">
        <div className="w-full max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Image
              src="/logo.png"
              alt="ENB Mini App Logo"
              width={40}
              height={40}
              className="rounded-lg"
            />
            <h1 className="text-xl font-bold">ENB MINI APP</h1>
          </div>

          <div className="flex items-center space-x-2">
            {saveFrameButton}
          </div>

          {address && (
            <div className="flex items-center space-x-2">
              <div className="px-3 py-1.5 bg-[var(--app-gray)] rounded-full text-sm font-medium">
                {truncateAddress(address)}
              </div>
              {profileState === 'found' && userProfile && (
                <div className={`w-2 h-2 rounded-full ${userProfile.isActivated ? 'bg-green-500' : 'bg-yellow-500'}`} title={userProfile.isActivated ? 'Activated' : 'Not Activated'} />
              )}
            </div>
          )}
        </div>
      </header>

      <div className="w-full max-w-md mx-auto px-4 py-3 pt-20">
        <main className="flex-1">{renderMainComponent()}</main>
        <footer className="mt-2 pt-4 flex justify-center">ENB Mini App</footer>
      </div>
    </div>
  );
}