'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import mockData from '../mockData.json';

interface UserProfile {
  walletAddress: string;
  membershipLevel: 'Based' | 'Super Based' | 'Legendary' | string;
  enbBalance: number;
  lastCheckinTime?: string | null;
  consecutiveDays: number;
  totalEarned: number;
  username?: string;
  joinDate?: string;
}

const DEFAULT_WALLET = '0x1234567890abcdef1234567890abcdef12345678';

export function Account() {
  const { address, isConnected } = useAccount();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let walletToUse = DEFAULT_WALLET;

    if (isConnected && address) {
      walletToUse = address;
    }

    const user = mockData.users.find(
      (u) => u.walletAddress.toLowerCase() === walletToUse.toLowerCase()
    );

    if (user) {
      setUserProfile(user);
    } else {
      const fallbackUser = mockData.users.find(
        (u) => u.walletAddress.toLowerCase() === DEFAULT_WALLET.toLowerCase()
      );
      setUserProfile(fallbackUser || null);
      setIsDefaultProfile(true);
    }

    setLoading(false);
  }, [address, isConnected]);

  const getMembershipLevelColor = (level: string) => {
    switch (level) {
      case 'Based':
        return 'text-blue-600';
      case 'Super Based':
        return 'text-purple-600';
      case 'Legendary':
        return 'text-yellow-600';
      default:
        return 'text-gray-600';
    }
  };

  const formatWalletAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1>Account Profile</h1>
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1>Account Profile</h1>
        <p className="text-red-600">No profile data available.</p>
      </div>
    );
  }

//  const levelInfo = mockData.membershipLevels[userProfile.membershipLevel]; //

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-xl font-semibold mb-2 text-gray-800">Account Profile</h1>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Basic Info */}
        <div className="bg-white p-6 rounded-lg shadow-md border">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">Basic Information</h2>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-600">Wallet Address</label>
              <p className="text-gray-800 font-mono">{formatWalletAddress(userProfile.walletAddress)}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Mining Level</label>
              <p className={`font-semibold ${getMembershipLevelColor(userProfile.membershipLevel)}`}>
                {userProfile.membershipLevel}
              </p>
            </div>
          </div>
        </div>

        {/* Token Balance */}
        <div className="bg-white p-6 rounded-lg shadow-md border">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">Token Balance</h2>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-600">ENB Balance</label>
              <p className="text-2xl font-bold text-green-600">
                {userProfile.enbBalance.toLocaleString()} ENB
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Total Earned</label>
              <p className="text-lg font-semibold text-blue-600">
                {userProfile.totalEarned.toLocaleString()} ENB
              </p>
            </div>
          </div>
        </div>

        {/* Mining Activity */}
        <div className="bg-white p-6 rounded-lg shadow-md border">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">Mining Activity</h2>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-600">Consecutive Days</label>
              <p className="text-lg font-semibold text-purple-600">
                {userProfile.consecutiveDays} days
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Last Check-in</label>
              <p className="text-gray-800">
                {userProfile.lastCheckinTime ? formatDate(userProfile.lastCheckinTime) : 'Never'}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="bg-white p-6 rounded-lg shadow-md border">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">Actions</h2>
          <div className="space-y-3">
            <button className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              Daily Check-in
            </button>
            <button className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
              Upgrade Mining Level
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
