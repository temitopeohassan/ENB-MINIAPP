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
  const [debugInfo, setDebugInfo] = useState<string>('');

  const { addFrame } = useAddFrame();
  const frameConnector = useMemo(() => farcasterFrame(), []);

  // Debug logging function
  const addDebugLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    setDebugInfo(prev => prev + logMessage + '\n');
  }, []);

  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
      addDebugLog("Frame set to ready");
    }
  }, [setFrameReady, isFrameReady, addDebugLog]);

  useEffect(() => {
    const autoConnect = async () => {
      try {
        if (!isConnected) {
          addDebugLog("Attempting auto-connect...");
          await connect({ connector: frameConnector });
          addDebugLog("Auto-connect successful");
        } else {
          addDebugLog("Already connected");
        }
      } catch (error) {
        addDebugLog(`Auto-connect failed: ${error}`);
        console.error("Auto-connect failed:", error);
      }
    };
    autoConnect();
  }, [isConnected, connect, frameConnector, addDebugLog]);

  // Track state changes
  useEffect(() => {
    addDebugLog(`Connection state changed - isConnected: ${isConnected}, address: ${address}`);
  }, [isConnected, address, addDebugLog]);

  useEffect(() => {
    addDebugLog(`Profile state changed - profileState: ${profileState}, userProfile exists: ${!!userProfile}, isActivated: ${userProfile?.isActivated}`);
  }, [profileState, userProfile, addDebugLog]);

  const fetchUserProfile = useCallback(async (walletAddress: string) => {
    addDebugLog(`Starting profile fetch for address: ${walletAddress}`);
    
    if (!walletAddress) {
      addDebugLog("No wallet address provided - setting to not-found");
      setUserProfile(null);
      setProfileState('not-found');
      setApiError(null);
      return;
    }

    setProfileState('loading');
    setApiError(null);
    addDebugLog(`Set profile state to loading`);

    try {
      const apiUrl = `${API_BASE_URL}/api/profile/${walletAddress}`;
      addDebugLog(`Making API call to: ${apiUrl}`);
      
      const response = await fetch(apiUrl);
      addDebugLog(`API response status: ${response.status}`);

      if (response.status === 404) {
        addDebugLog("Profile not found (404) - setting state to not-found");
        setUserProfile(null);
        setProfileState('not-found');
        return;
      }

      if (!response.ok) {
        const errorData: ApiError = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(errorData.message || errorData.error || 'Failed to fetch profile');
      }

      const profileData: User = await response.json();
      addDebugLog(`Raw API response: ${JSON.stringify(profileData, null, 2)}`);
      
      // Log the specific isActivated field
      addDebugLog(`Raw isActivated value: ${profileData.isActivated} (type: ${typeof profileData.isActivated})`);
      
      // Normalize the profile data
      const normalizedProfile: User = {
        ...profileData,
        isActivated: profileData.isActivated === true || profileData.isActivated === 'true' || profileData.isActivated === 1
      };
      
      addDebugLog(`Normalized isActivated: ${normalizedProfile.isActivated} (type: ${typeof normalizedProfile.isActivated})`);
      addDebugLog(`Setting profile state to found`);
      
      setUserProfile(normalizedProfile);
      setProfileState('found');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      addDebugLog(`Error fetching profile: ${errorMessage}`);
      console.error('Error fetching user profile:', error);
      setApiError(errorMessage);
      setUserProfile(null);
      setProfileState('error');
    }
  }, [addDebugLog]);

  useEffect(() => {
    if (address) {
      addDebugLog(`Address available: ${address} - fetching profile`);
      fetchUserProfile(address);
    } else {
      addDebugLog("No address - resetting profile state");
      setUserProfile(null);
      setProfileState('loading');
      setApiError(null);
    }
  }, [address, fetchUserProfile, addDebugLog]);

  const refreshUserProfile = useCallback(async () => {
    addDebugLog("Manual profile refresh requested");
    if (address) {
      await fetchUserProfile(address);
    }
  }, [address, fetchUserProfile, addDebugLog]);

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

  // Determine what to render based on current state
  const getComponentToRender = () => {
    addDebugLog(`getComponentToRender called - evaluating current state`);
    
    // Check wallet connection first
    if (!isConnected || !address) {
      addDebugLog("Decision: Wallet not connected - showing connection loading");
      return 'wallet-loading';
    }

    // Check profile loading state
    if (profileState === 'loading') {
      addDebugLog("Decision: Profile is loading - showing profile loading");
      return 'profile-loading';
    }

    // Check for errors
    if (profileState === 'error') {
      addDebugLog("Decision: Profile error - showing error component");
      return 'error';
    }

    // Check for profile not found
    if (profileState === 'not-found') {
      addDebugLog("Decision: Profile not found - showing Create component");
      return 'create';
    }

    // Check if profile was found
    if (profileState === 'found') {
      if (!userProfile) {
        addDebugLog("Decision: ERROR - Profile state is 'found' but userProfile is null");
        return 'error';
      }

      const isActivated = userProfile.isActivated;
      addDebugLog(`Decision: Profile found - isActivated: ${isActivated}`);
      
      if (isActivated) {
        addDebugLog("Decision: Account is activated - showing Account component");
        return 'account';
      } else {
        addDebugLog("Decision: Account is not activated - showing Create component");
        return 'create';
      }
    }

    addDebugLog("Decision: Unexpected state - showing fallback");
    return 'fallback';
  };

  const renderMainComponent = () => {
    const componentToRender = getComponentToRender();
    addDebugLog(`Rendering component: ${componentToRender}`);

    switch (componentToRender) {
      case 'wallet-loading':
        return (
          <div className="flex justify-center items-center py-20">
            <div className="text-center">
              <p className="text-gray-600 mb-4">Connecting wallet...</p>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            </div>
          </div>
        );

      case 'profile-loading':
        return (
          <div className="flex justify-center items-center py-20">
            <div className="text-center">
              <p className="text-gray-600 mb-4">Loading profile...</p>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            </div>
          </div>
        );

      case 'error':
        return (
          <div className="flex justify-center items-center py-20">
            <div className="text-center">
              <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-sm mx-auto">
                <Icon name="arrow-right" size="lg" className="text-red-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-red-800 mb-2">Error Loading Profile</h3>
                <p className="text-red-600 text-sm mb-4">{apiError || 'Unknown error'}</p>
                <Button 
                  onClick={() => fetchUserProfile(address!)} 
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

      case 'create':
        addDebugLog("RENDERING CREATE COMPONENT");
        return <Create refreshUserAccountAction={refreshUserProfile} />;

      case 'account':
        addDebugLog("RENDERING ACCOUNT COMPONENT");
        return <Account userProfile={userProfile!} />;

      case 'fallback':
      default:
        return (
          <div className="flex justify-center items-center py-20">
            <div className="text-center">
              <p className="text-gray-500 mb-4">Unexpected application state</p>
              <div className="text-xs text-gray-400 mt-2 p-2 bg-gray-100 rounded max-w-xs">
                <div>State: {profileState}</div>
                <div>Profile: {userProfile ? 'exists' : 'null'}</div>
                <div>Activated: {userProfile?.isActivated?.toString()}</div>
              </div>
              <Button 
                onClick={() => fetchUserProfile(address!)} 
                className="mt-4"
                size="sm"
              >
                Refresh Profile
              </Button>
            </div>
          </div>
        );
    }
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
        
        {/* Debug Panel - Remove this in production */}
        <div className="mt-4 p-3 bg-gray-100 rounded text-xs max-h-40 overflow-y-auto">
          <div className="font-bold mb-2">Debug Log:</div>
          <pre className="whitespace-pre-wrap text-xs">{debugInfo.split('\n').slice(-20).join('\n')}</pre>
          <button 
            onClick={() => setDebugInfo('')}
            className="mt-2 px-2 py-1 bg-gray-300 rounded text-xs"
          >
            Clear Log
          </button>
        </div>
        
        <footer className="mt-2 pt-4 flex justify-center">ENB Mini App</footer>
      </div>
    </div>
  );
}