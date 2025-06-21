'use client';

import { useEffect, useState } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { ENB_MINI_APP_ABI, ENB_MINI_APP_ADDRESS } from '../constants/enbMiniAppAbi';
import { API_BASE_URL } from '../config';

interface UserProfile {
  walletAddress: string;
  membershipLevel: 'Based' | 'Super Based' | 'Legendary' | string;
  invitationCode: string | null;
  enbBalance: number;
  lastCheckinTime?: string | null;
  consecutiveDays: number;
  totalEarned: number;
  joinDate?: string;
  isActivated: boolean;
}

export function Account() {
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!isConnected || !address) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/profile/${address}`);
        
        if (response.ok) {
          const data = await response.json();
          setUserProfile(data);
        } else if (response.status === 404) {
          // User not found - this shouldn't happen if Account component is shown
          console.error('User profile not found');
          setUserProfile(null);
        } else {
          throw new Error('Failed to fetch user profile');
        }
      } catch (error) {
        console.error('Error fetching user profile:', error);
        setUserProfile(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUserProfile();
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

  const handleCheckin = async () => {
    if (!address) return;

    setActionLoading(true);
    try {
      // Call the API check-in endpoint
      const response = await fetch(`${API_BASE_URL}/api/checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: address,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        alert(`Check-in successful! You earned ${data.reward} ENB`);
        
        // Refresh user profile to get updated data
        const profileResponse = await fetch(`${API_BASE_URL}/api/profile/${address}`);
        if (profileResponse.ok) {
          const updatedProfile = await profileResponse.json();
          setUserProfile(updatedProfile);
        }
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Check-in failed');
      }
    } catch (err) {
      console.error(err);
      alert('Check-in failed. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpgrade = async () => {
    if (!address || !userProfile) return;

    let targetLevel: number;

    switch (userProfile.membershipLevel) {
      case 'Based':
        targetLevel = 1;
        break;
      case 'Super Based':
        targetLevel = 2;
        break;
      default:
        alert('You are already at the highest level!');
        return;
    }

    setActionLoading(true);
    try {
      // First, call the blockchain contract
      const txHash = await writeContractAsync({
        address: ENB_MINI_APP_ADDRESS,
        abi: ENB_MINI_APP_ABI,
        functionName: 'upgradeMembership',
        args: [address, targetLevel],
      });

      // Call the API to update membership level
      const response = await fetch(`${API_BASE_URL}/api/update-membership`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: address,
          membershipLevel: targetLevel === 1 ? 'Super Based' : 'Legendary',
          transactionHash: txHash,
        }),
      });

      if (response.ok) {
        alert('Upgrade successful!');
        
        // Refresh user profile to get updated data
        const profileResponse = await fetch(`${API_BASE_URL}/api/profile/${address}`);
        if (profileResponse.ok) {
          const updatedProfile = await profileResponse.json();
          setUserProfile(updatedProfile);
        }
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to update membership level');
      }
    } catch (err) {
      console.error(err);
      alert('Upgrade failed. See console for details.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-xl font-semibold mb-2 text-gray-800">Account Profile</h1>
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-xl font-semibold mb-2 text-gray-800">Account Profile</h1>
        <p className="text-red-600">No profile data available.</p>
      </div>
    );
  }

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
            {userProfile.invitationCode && (
              <div>
                <label className="text-sm font-medium text-gray-600">Invitation Code</label>
                <p className="text-gray-800 font-mono">{userProfile.invitationCode}</p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-gray-600">Status</label>
              <p className={`font-semibold ${userProfile.isActivated ? 'text-green-600' : 'text-orange-600'}`}>
                {userProfile.isActivated ? 'Activated' : 'Not Activated'}
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
            {userProfile.joinDate && (
              <div>
                <label className="text-sm font-medium text-gray-600">Join Date</label>
                <p className="text-gray-800">
                  {formatDate(userProfile.joinDate)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="bg-white p-6 rounded-lg shadow-md border">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">Actions</h2>
          <div className="space-y-3">
            <button
              disabled={actionLoading || !userProfile.isActivated}
              onClick={handleCheckin}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {actionLoading ? 'Checking in...' : 'Daily Check-in'}
            </button>

            <button
              disabled={actionLoading}
              onClick={handleUpgrade}
              className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-60"
            >
              {actionLoading ? 'Upgrading...' : 'Upgrade Mining Level'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
