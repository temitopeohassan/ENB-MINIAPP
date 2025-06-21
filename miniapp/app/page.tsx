"use client";

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

export default function App() {
  const { setFrameReady, isFrameReady, context } = useMiniKit();
  const [frameAdded, setFrameAdded] = useState(false);
  const { isConnected, address } = useAccount();
  const { connect } = useConnect();

  // New state for user account checking
  const [userAccount, setUserAccount] = useState<User | null>(null);
  const [isLoadingAccount, setIsLoadingAccount] = useState(false);
  const [accountCheckComplete, setAccountCheckComplete] = useState(false);

  const { addFrame } = useAddFrame();

  // Initialize frame connector
  const frameConnector = useMemo(() => farcasterFrame(), []);

  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

  // Auto connect wallet on component mount
  useEffect(() => {
    const autoConnect = async () => {
      try {
        if (!isConnected) {
          console.log("Attempting to auto-connect wallet...");
          await connect({ connector: frameConnector });
        }
      } catch (error) {
        console.error("Auto-connect failed:", error);
      }
    };
    autoConnect();
  }, [isConnected, connect, frameConnector]);

  // Check if user has an account when wallet connects
  useEffect(() => {
    const checkUserAccount = async () => {
      if (!address) {
        setUserAccount(null);
        setAccountCheckComplete(true);
        return;
      }

      setIsLoadingAccount(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/users?limit=1000`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch users');
        }

        const data = await response.json();
        const user = data.users.find((u: User) => 
          u.walletAddress.toLowerCase() === address.toLowerCase()
        );

        setUserAccount(user || null);
      } catch (error) {
        console.error('Error checking user account:', error);
        setUserAccount(null);
      } finally {
        setIsLoadingAccount(false);
        setAccountCheckComplete(true);
      }
    };

    checkUserAccount();
  }, [address]);

  // Function to refresh user account check (for after activation)
  const refreshUserAccountAction = useCallback(async () => {
    if (!address) return;

    setIsLoadingAccount(true);
    setAccountCheckComplete(false);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/users?limit=1000`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }

      const data = await response.json();
      const user = data.users.find((u: User) => 
        u.walletAddress.toLowerCase() === address.toLowerCase()
      );

      setUserAccount(user || null);
    } catch (error) {
      console.error('Error checking user account:', error);
      setUserAccount(null);
    } finally {
      setIsLoadingAccount(false);
      setAccountCheckComplete(true);
    }
  }, [address]);

  const handleAddFrame = useCallback(async () => {
    try {
      console.log("Adding frame...");
      const frameAdded = await addFrame({ 
        id: 'airtimeplus',
        title: 'AirtimePlus',
        description: 'Buy airtime with USDC',
        image: process.env.NEXT_PUBLIC_ICON_URL || '',
      });
      console.log("Frame added:", frameAdded);
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

  // Determine which component to render
  const renderMainComponent = () => {
    if (!accountCheckComplete || isLoadingAccount) {
      return (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      );
    }

    if (!isConnected || !address) {
      return (
        <div className="flex justify-center items-center py-20">
          <div className="text-center">
            <p className="text-gray-600 mb-4">Please connect your wallet to continue</p>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        </div>
      );
    }

    // If user has an account and it's activated, show Account component
    if (userAccount && userAccount.isActivated) {
      return <Account />;
    }

    // If user has an account but it's not activated, or doesn't have an account, show Create component
    return <Create refreshUserAccountAction={refreshUserAccountAction} />;
  };

  return (
    <div className="flex flex-col min-h-screen font-sans text-[var(--app-foreground)] mini-app-theme from-[var(--app-background)] to-[var(--app-gray)]">
      {/* Fixed Header */}
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
            </div>
          )}
        </div>
      </header>

      {/* Main Content with top padding for fixed header */}
      <div className="w-full max-w-md mx-auto px-4 py-3 pt-20">
        <main className="flex-1">
          {renderMainComponent()}
        </main>

        <footer className="mt-2 pt-4 flex justify-center">
          ENB Mini App
        </footer>
      </div>
    </div>
  );
}
