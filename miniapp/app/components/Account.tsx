'use client';

import { useState } from 'react';
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

interface AccountProps {
  userProfile: UserProfile;
}

export const Account: React.FC<AccountProps> = ({ userProfile }) => {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [actionLoading, setActionLoading] = useState(false);
  const [profile, setProfile] = useState(userProfile); // local state for UI update after check-in or upgrade

  const getMembershipLevelColor = (level: string) => {
    switch (level) {
      case 'Based': return 'text-blue-600';
      case 'Super Based': return 'text-purple-600';
      case 'Legendary': return 'text-yellow-600';
      default: return 'text-gray-600';
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

  const refreshProfile = async () => {
    const res = await fetch(`${API_BASE_URL}/api/profile/${address}`);
    if (res.ok) {
      const updated = await res.json();
      setProfile(updated);
    }
  };

  const handleCheckin = async () => {
    if (!address) return;

    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Check-in failed');

      alert(`Check-in successful! You earned ${data.reward} ENB`);
      await refreshProfile();
    } catch (err) {
      console.error(err);
      alert('Check-in failed. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpgrade = async () => {
    if (!address || !profile) return;

    let targetLevel: number;
    switch (profile.membershipLevel) {
      case 'Based': targetLevel = 1; break;
      case 'Super Based': targetLevel = 2; break;
      default:
        alert('You are already at the highest level!');
        return;
    }

    setActionLoading(true);
    try {
      const txHash = await writeContractAsync({
        address: ENB_MINI_APP_ADDRESS,
        abi: ENB_MINI_APP_ABI,
        functionName: 'upgradeMembership',
        args: [address, targetLevel],
      });

      const res = await fetch(`${API_BASE_URL}/api/update-membership`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          membershipLevel: targetLevel === 1 ? 'Super Based' : 'Legendary',
          transactionHash: txHash,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upgrade failed');

      alert('Upgrade successful!');
      await refreshProfile();
    } catch (err) {
      console.error(err);
      alert('Upgrade failed. See console for details.');
    } finally {
      setActionLoading(false);
    }
  };

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
              <p className="text-gray-800 font-mono">{formatWalletAddress(profile.walletAddress)}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Mining Level</label>
              <p className={`font-semibold ${getMembershipLevelColor(profile.membershipLevel)}`}>
                {profile.membershipLevel}
              </p>
            </div>
            {profile.invitationCode && (
              <div>
                <label className="text-sm font-medium text-gray-600">Invitation Code</label>
                <p className="text-gray-800 font-mono">{profile.invitationCode}</p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-gray-600">Status</label>
              <p className={`font-semibold ${profile.isActivated ? 'text-green-600' : 'text-orange-600'}`}>
                {profile.isActivated ? 'Activated' : 'Not Activated'}
              </p>
            </div>
          </div>
        </div>

        {/* Token Info */}
        <div className="bg-white p-6 rounded-lg shadow-md border">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">Token Balance</h2>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-600">ENB Balance</label>
              <p className="text-2xl font-bold text-green-600">
                {profile.enbBalance.toLocaleString()} ENB
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Total Earned</label>
              <p className="text-lg font-semibold text-blue-600">
                {profile.totalEarned.toLocaleString()} ENB
              </p>
            </div>
          </div>
        </div>

        {/* Activity Info */}
        <div className="bg-white p-6 rounded-lg shadow-md border">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">Mining Activity</h2>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-600">Consecutive Days</label>
              <p className="text-lg font-semibold text-purple-600">
                {profile.consecutiveDays} days
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Last Check-in</label>
              <p className="text-gray-800">
                {profile.lastCheckinTime ? formatDate(profile.lastCheckinTime) : 'Never'}
              </p>
            </div>
            {profile.joinDate && (
              <div>
                <label className="text-sm font-medium text-gray-600">Join Date</label>
                <p className="text-gray-800">{formatDate(profile.joinDate)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="bg-white p-6 rounded-lg shadow-md border">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">Actions</h2>
          <div className="space-y-3">
            <button
              disabled={actionLoading || !profile.isActivated}
              onClick={handleCheckin}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
            >
              {actionLoading ? 'Checking in...' : 'Daily Check-in'}
            </button>
            <button
              disabled={actionLoading}
              onClick={handleUpgrade}
              className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-60"
            >
              {actionLoading ? 'Upgrading...' : 'Upgrade Mining Level'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
