// server.js
import express from 'express';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import cors from 'cors';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';

// Load env vars from .env file
dotenv.config();

// Firebase Admin SDK initialization
if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  console.error('FATAL ERROR: FIREBASE_SERVICE_ACCOUNT_JSON is not defined. Please check your .env file or environment variables.');
  process.exit(1);
}
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Configure CORS with specific options
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://enb-crushers.vercel.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  credentials: false,
  maxAge: 86400
}));

// Function to generate random invitation code
const generateInvitationCode = () => {
  // Generate a 8-character alphanumeric code
  return crypto.randomBytes(4).toString('hex').toUpperCase();
};

// Function to check if invitation code already exists
const isInvitationCodeUnique = async (code) => {
  const snapshot = await db.collection('accounts')
    .where('invitationCode', '==', code)
    .limit(1)
    .get();
  
  return snapshot.empty;
};

// Function to generate unique invitation code
const generateUniqueInvitationCode = async () => {
  let code;
  let attempts = 0;
  const maxAttempts = 10;

  do {
    code = generateInvitationCode();
    attempts++;
    
    if (attempts > maxAttempts) {
      throw new Error('Failed to generate unique invitation code after maximum attempts');
    }
  } while (!(await isInvitationCodeUnique(code)));

  return code;
};

// Basic route
app.get('/', (req, res) => {
  res.send('ENB API is running.');
});

// Create user account
app.post('/api/create-account', async (req, res) => {
  console.log('📥 Incoming /api/create-account call');
  console.log('Request body:', req.body);

  const { walletAddress, transactionHash } = req.body;

  if (!walletAddress || !transactionHash) {
    console.warn('⚠️ Missing fields', { walletAddress, transactionHash });
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    console.log('Generating invitation code for:', walletAddress);
    const invitationCode = await generateUniqueInvitationCode();
    console.log('Generated invitation code:', invitationCode);

    await db.collection('accounts').doc(walletAddress).set({
      walletAddress,
      transactionHash,
      membershipLevel: 'Based',
      invitationCode,
      createdAt: new Date(),
      lastDailyClaimTime: null,
      consecutiveDays: 0,
      enbBalance: 0,
      totalEarned: 0,
      isActivated: false,
    });

    console.log('✅ Account created', { walletAddress, invitationCode });
    return res.status(201).json({ message: 'Account created successfully' });
  } catch (error) {
    console.error('❌ Error creating account for', walletAddress, error);
    return res.status(500).json({ error: 'Failed to create account' });
  }
});

// Create default user with limited invitation code
app.post('/api/create-default-user', async (req, res) => {
  const { walletAddress, invitationCode, maxUses } = req.body;

  if (!walletAddress || !invitationCode) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Check if invitation code already exists
    const existingCodeQuery = db.collection('accounts')
      .where('invitationCode', '==', invitationCode)
      .limit(1);
    const existingCodeSnapshot = await existingCodeQuery.get();

    if (!existingCodeSnapshot.empty) {
      return res.status(400).json({ error: 'Invitation code already exists' });
    }

    // Create the default user
    await db.collection('accounts').doc(walletAddress).set({
      walletAddress,
      membershipLevel: 'Based',
      invitationCode,
      maxInvitationUses: maxUses || 105, // Default to 105 uses
      currentInvitationUses: 0,
      createdAt: new Date(),
      lastDailyClaimTime: null,
      consecutiveDays: 0,
      enbBalance: 0,
      totalEarned: 0,
      isActivated: true, // Default user is activated
      activatedAt: new Date()
    });

    return res.status(201).json({ 
      message: 'Default user created successfully',
      invitationCode,
      maxUses: maxUses || 105
    });
  } catch (error) {
    console.error('Error creating default user:', error);
    return res.status(500).json({ error: 'Failed to create default user' });
  }
});

// Activate user account
app.post('/api/activate-account', async (req, res) => {
  const { walletAddress, invitationCode } = req.body;

  if (!walletAddress || !invitationCode) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Fetch user account
    const accountDoc = await db.collection('accounts').doc(walletAddress).get();

    if (!accountDoc.exists) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const accountData = accountDoc.data();

    if (accountData.isActivated) {
      return res.status(400).json({ error: 'Account is already activated' });
    }

    // Find the user with the invitation code
    const invitationQuery = db.collection('accounts')
      .where('invitationCode', '==', invitationCode)
      .limit(1);
    const invitationSnapshot = await invitationQuery.get();

    if (invitationSnapshot.empty) {
      return res.status(400).json({ error: 'Invalid invitation code' });
    }

    const inviterDoc = invitationSnapshot.docs[0];
    const inviterData = inviterDoc.data();

    // Check if the inviter is activated
    if (!inviterData.isActivated) {
      return res.status(400).json({ error: 'Invitation code is from an inactive account' });
    }

    // Check if invitation code has reached its usage limit
    const maxUses = inviterData.maxInvitationUses || 5; // Default to 5 for regular users
    const currentUses = inviterData.currentInvitationUses || 0;

    if (currentUses >= maxUses) {
      return res.status(400).json({ error: 'Invitation code usage limit exceeded' });
    }

    // Check if this wallet has already used this invitation code
    const existingUsageQuery = db.collection('invitationUsage')
      .where('invitationCode', '==', invitationCode)
      .where('usedBy', '==', walletAddress)
      .limit(1);
    const existingUsageSnapshot = await existingUsageQuery.get();

    if (!existingUsageSnapshot.empty) {
      return res.status(400).json({ error: 'You have already used this invitation code' });
    }

    // Prepare usage log
    const usageLog = {
      invitationCode: invitationCode,
      usedBy: walletAddress,
      usedAt: new Date(),
      inviterWallet: inviterData.walletAddress
    };

    // Batch update
    const batch = db.batch();

    const accountRef = db.collection('accounts').doc(walletAddress);
    batch.update(accountRef, {
      isActivated: true,
      activatedAt: new Date(),
      activatedBy: invitationCode,
      inviterWallet: inviterData.walletAddress
    });

    // Update inviter's usage count
    const inviterRef = db.collection('accounts').doc(inviterData.walletAddress);
    batch.update(inviterRef, {
      currentInvitationUses: currentUses + 1
    });

    // Add usage log
    const usageRef = db.collection('invitationUsage').doc();
    batch.set(usageRef, usageLog);

    await batch.commit();

    return res.status(200).json({
      message: 'Account activated successfully',
      membershipLevel: accountData.membershipLevel || 'Based',
      inviterWallet: inviterData.walletAddress,
      remainingUses: maxUses - (currentUses + 1)
    });

  } catch (error) {
    console.error('Error activating account:', error);
    return res.status(500).json({ error: 'Failed to activate account' });
  }
});

app.get('/api/profile/:walletAddress', async (req, res) => {
  const walletAddress = req.params.walletAddress;

  try {
    const doc = await db.collection('accounts').doc(walletAddress).get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const data = doc.data();
    
    // Get invitation usage data if user has an invitation code
    let invitationUsage = null;
    if (data.invitationCode) {
      const maxUses = data.maxInvitationUses || 5;
      const currentUses = data.currentInvitationUses || 0;
      
      invitationUsage = {
        totalUses: currentUses,
        maxUses: maxUses,
        remainingUses: maxUses - currentUses
      };
    }
    
    const profileData = {
      walletAddress: data.walletAddress,
      membershipLevel: data.membershipLevel || 'Based',
      invitationCode: data.invitationCode || null,
      invitationUsage: invitationUsage,
      enbBalance: data.enbBalance || 0,
      lastDailyClaimTime: data.lastDailyClaimTime && data.lastDailyClaimTime.toDate ? data.lastDailyClaimTime.toDate().toISOString() : (data.lastDailyClaimTime ? data.lastDailyClaimTime.toISOString() : null),
      consecutiveDays: data.consecutiveDays || 0,
      totalEarned: data.totalEarned || 0,
      isActivated: data.isActivated || false,
      activatedAt: data.activatedAt && data.activatedAt.toDate ? data.activatedAt.toDate().toISOString() : (data.activatedAt ? data.activatedAt.toISOString() : null),
      joinDate: data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().toISOString() : (data.createdAt ? data.createdAt.toISOString() : null)
    };

    return res.status(200).json(profileData);
  } catch (error) {
    console.error('Error fetching profile:', error);
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Daily claim functionality
app.post('/api/daily-claim', async (req, res) => {
  const { walletAddress, transactionHash } = req.body;

  if (!walletAddress || !transactionHash) {
    return res.status(400).json({ error: 'Missing wallet address or transaction hash' });
  }

  try {
    const accountRef = db.collection('accounts').doc(walletAddress);
    const accountDoc = await accountRef.get();

    if (!accountDoc.exists) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const accountData = accountDoc.data();

    if (!accountData.isActivated) {
      return res.status(400).json({ error: 'Account is not activated' });
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Check if user already claimed today
    if (accountData.lastDailyClaimTime) {
      const lastClaim = accountData.lastDailyClaimTime.toDate();
      const lastClaimDate = new Date(lastClaim.getFullYear(), lastClaim.getMonth(), lastClaim.getDate());
      
      if (lastClaimDate.getTime() === today.getTime()) {
        return res.status(400).json({ error: 'Already claimed today' });
      }
    }

    // Calculate consecutive days and rewards
    let consecutiveDays = 1;
    let enbReward = 10; // Base reward

    if (accountData.lastDailyClaimTime) {
      const lastClaim = accountData.lastDailyClaimTime.toDate();
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const lastClaimDate = new Date(lastClaim.getFullYear(), lastClaim.getMonth(), lastClaim.getDate());

      if (lastClaimDate.getTime() === yesterday.getTime()) {
        consecutiveDays = (accountData.consecutiveDays || 0) + 1;
        // Bonus for consecutive days (max 5x multiplier)
        const multiplier = Math.min(consecutiveDays, 5);
        enbReward = 10 * multiplier;
      }
    }

    // Membership level bonuses
    const membershipMultiplier = {
      'Based': 1,
      'Super Based': 1.5,
      'Legendary': 2
    };

    const finalReward = Math.floor(enbReward * (membershipMultiplier[accountData.membershipLevel] || 1));

    // Update account
    await accountRef.update({
      lastDailyClaimTime: now,
      consecutiveDays: consecutiveDays,
      enbBalance: (accountData.enbBalance || 0) + finalReward,
      totalEarned: (accountData.totalEarned || 0) + finalReward,
      lastTransactionHash: transactionHash
    });

    return res.status(200).json({
      message: 'Daily claim successful',
      reward: finalReward,
      consecutiveDays: consecutiveDays,
      newBalance: (accountData.enbBalance || 0) + finalReward
    });

  } catch (error) {
    console.error('Error during daily claim:', error);
    return res.status(500).json({ error: 'Failed to process daily claim' });
  }
});

// Get daily claim status
app.get('/api/daily-claim-status/:walletAddress', async (req, res) => {
  const walletAddress = req.params.walletAddress;

  try {
    const accountDoc = await db.collection('accounts').doc(walletAddress).get();

    if (!accountDoc.exists) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const accountData = accountDoc.data();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let canClaim = true;
    let lastClaimToday = false;

    if (accountData.lastDailyClaimTime) {
      const lastClaim = accountData.lastDailyClaimTime.toDate();
      const lastClaimDate = new Date(lastClaim.getFullYear(), lastClaim.getMonth(), lastClaim.getDate());
      
      if (lastClaimDate.getTime() === today.getTime()) {
        canClaim = false;
        lastClaimToday = true;
      }
    }

    return res.status(200).json({
      canClaim,
      lastClaimToday,
      consecutiveDays: accountData.consecutiveDays || 0,
      lastDailyClaimTime: accountData.lastDailyClaimTime || null
    });

  } catch (error) {
    console.error('Error fetching daily claim status:', error);
    return res.status(500).json({ error: 'Failed to fetch daily claim status' });
  }
});

// Update ENB balance (for transactions)
app.post('/api/update-balance', async (req, res) => {
  const { walletAddress, amount, type, description } = req.body;

  if (!walletAddress || amount === undefined || !type) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!['credit', 'debit'].includes(type)) {
    return res.status(400).json({ error: 'Invalid transaction type' });
  }

  try {
    const accountRef = db.collection('accounts').doc(walletAddress);
    const accountDoc = await accountRef.get();

    if (!accountDoc.exists) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const accountData = accountDoc.data();
    const currentBalance = accountData.enbBalance || 0;
    const transactionAmount = parseFloat(amount);

    // Calculate new balance
    let newBalance;
    if (type === 'credit') {
      newBalance = currentBalance + transactionAmount;
    } else {
      if (currentBalance < transactionAmount) {
        return res.status(400).json({ error: 'Insufficient balance' });
      }
      newBalance = currentBalance - transactionAmount;
    }

    // Create transaction record
    const transactionData = {
      walletAddress,
      amount: transactionAmount,
      type,
      description: description || '',
      balanceBefore: currentBalance,
      balanceAfter: newBalance,
      timestamp: new Date()
    };

    // Batch update
    const batch = db.batch();
    
    // Update account balance
    batch.update(accountRef, { enbBalance: newBalance });
    
    // Add transaction record
    const transactionRef = db.collection('transactions').doc();
    batch.set(transactionRef, transactionData);

    await batch.commit();

    return res.status(200).json({
      message: 'Balance updated successfully',
      previousBalance: currentBalance,
      newBalance: newBalance,
      transactionId: transactionRef.id
    });

  } catch (error) {
    console.error('Error updating balance:', error);
    return res.status(500).json({ error: 'Failed to update balance' });
  }
});

// Get transaction history
app.get('/api/transactions/:walletAddress', async (req, res) => {
  const walletAddress = req.params.walletAddress;
  const limit = parseInt(req.query.limit) || 50;

  try {
    const transactionsQuery = db.collection('transactions')
      .where('walletAddress', '==', walletAddress)
      .orderBy('timestamp', 'desc')
      .limit(limit);

    const snapshot = await transactionsQuery.get();
    const transactions = [];

    snapshot.forEach(doc => {
      transactions.push({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp.toISOString()
      });
    });

    return res.status(200).json({ transactions });

  } catch (error) {
    console.error('Error fetching transactions:', error);
    return res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Leaderboard - Top ENB Balance
app.get('/api/leaderboard/balance', async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;

  try {
    const leaderboardQuery = db.collection('accounts')
      .where('isActivated', '==', true)
      .orderBy('enbBalance', 'desc')
      .limit(limit);

    const snapshot = await leaderboardQuery.get();
    const leaderboard = [];

    snapshot.forEach((doc, index) => {
      const data = doc.data();
      leaderboard.push({
        rank: index + 1,
        walletAddress: data.walletAddress,
        enbBalance: data.enbBalance || 0,
        membershipLevel: data.membershipLevel || 'Based',
        consecutiveDays: data.consecutiveDays || 0
      });
    });

    return res.status(200).json({ leaderboard });

  } catch (error) {
    console.error('Error fetching balance leaderboard:', error);
    return res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Leaderboard - Top Total Earned
app.get('/api/leaderboard/earnings', async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;

  try {
    const leaderboardQuery = db.collection('accounts')
      .where('isActivated', '==', true)
      .orderBy('totalEarned', 'desc')
      .limit(limit);

    const snapshot = await leaderboardQuery.get();
    const leaderboard = [];

    snapshot.forEach((doc, index) => {
      const data = doc.data();
      leaderboard.push({
        rank: index + 1,
        walletAddress: data.walletAddress,
        totalEarned: data.totalEarned || 0,
        membershipLevel: data.membershipLevel || 'Based',
        consecutiveDays: data.consecutiveDays || 0
      });
    });

    return res.status(200).json({ leaderboard });

  } catch (error) {
    console.error('Error fetching earnings leaderboard:', error);
    return res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Leaderboard - Top Consecutive Days
app.get('/api/leaderboard/streaks', async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;

  try {
    const leaderboardQuery = db.collection('accounts')
      .where('isActivated', '==', true)
      .orderBy('consecutiveDays', 'desc')
      .limit(limit);

    const snapshot = await leaderboardQuery.get();
    const leaderboard = [];

    snapshot.forEach((doc, index) => {
      const data = doc.data();
      leaderboard.push({
        rank: index + 1,
        walletAddress: data.walletAddress,
        consecutiveDays: data.consecutiveDays || 0,
        membershipLevel: data.membershipLevel || 'Based',
        enbBalance: data.enbBalance || 0
      });
    });

    return res.status(200).json({ leaderboard });

  } catch (error) {
    console.error('Error fetching streaks leaderboard:', error);
    return res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Get user ranking across all leaderboards
app.get('/api/user-rankings/:walletAddress', async (req, res) => {
  const walletAddress = req.params.walletAddress;

  try {
    const accountDoc = await db.collection('accounts').doc(walletAddress).get();

    if (!accountDoc.exists) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const accountData = accountDoc.data();

    if (!accountData.isActivated) {
      return res.status(400).json({ error: 'Account is not activated' });
    }

    // Get balance ranking
    const balanceQuery = db.collection('accounts')
      .where('isActivated', '==', true)
      .where('enbBalance', '>', accountData.enbBalance || 0);
    const balanceSnapshot = await balanceQuery.get();
    const balanceRank = balanceSnapshot.size + 1;

    // Get earnings ranking
    const earningsQuery = db.collection('accounts')
      .where('isActivated', '==', true)
      .where('totalEarned', '>', accountData.totalEarned || 0);
    const earningsSnapshot = await earningsQuery.get();
    const earningsRank = earningsSnapshot.size + 1;

    // Get streak ranking
    const streakQuery = db.collection('accounts')
      .where('isActivated', '==', true)
      .where('consecutiveDays', '>', accountData.consecutiveDays || 0);
    const streakSnapshot = await streakQuery.get();
    const streakRank = streakSnapshot.size + 1;

    return res.status(200).json({
      walletAddress,
      rankings: {
        balance: {
          rank: balanceRank,
          value: accountData.enbBalance || 0
        },
        earnings: {
          rank: earningsRank,
          value: accountData.totalEarned || 0
        },
        streak: {
          rank: streakRank,
          value: accountData.consecutiveDays || 0
        }
      }
    });

  } catch (error) {
    console.error('Error fetching user rankings:', error);
    return res.status(500).json({ error: 'Failed to fetch user rankings' });
  }
});

// Get all users
app.get('/api/users', async (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  const membershipLevel = req.query.membershipLevel;
  const isActivated = req.query.isActivated;

  try {
    let query = db.collection('accounts');

    // Apply filters if provided
    if (membershipLevel) {
      query = query.where('membershipLevel', '==', membershipLevel);
    }
    
    if (isActivated !== undefined) {
      query = query.where('isActivated', '==', isActivated === 'true');
    }

    // Apply ordering and pagination
    query = query.orderBy('createdAt', 'desc').limit(limit).offset(offset);

    const snapshot = await query.get();
    const users = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      
      users.push({
        id: doc.id,
        walletAddress: data.walletAddress,
        membershipLevel: data.membershipLevel || 'Based',
        invitationCode: data.invitationCode || null,
        maxInvitationUses: data.maxInvitationUses || 5,
        currentInvitationUses: data.currentInvitationUses || 0,
        enbBalance: data.enbBalance || 0,
        totalEarned: data.totalEarned || 0,
        consecutiveDays: data.consecutiveDays || 0,
        isActivated: data.isActivated || false,
        createdAt: data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().toISOString() : (data.createdAt ? data.createdAt.toISOString() : null),
        activatedAt: data.activatedAt && data.activatedAt.toDate ? data.activatedAt.toDate().toISOString() : (data.activatedAt ? data.activatedAt.toISOString() : null),
        lastDailyClaimTime: data.lastDailyClaimTime && data.lastDailyClaimTime.toDate ? data.lastDailyClaimTime.toDate().toISOString() : (data.lastDailyClaimTime ? data.lastDailyClaimTime.toISOString() : null)
      });
    });

    // Get total count for pagination info
    const totalQuery = db.collection('accounts');
    let totalSnapshot;
    
    if (membershipLevel || isActivated !== undefined) {
      let countQuery = db.collection('accounts');
      if (membershipLevel) {
        countQuery = countQuery.where('membershipLevel', '==', membershipLevel);
      }
      if (isActivated !== undefined) {
        countQuery = countQuery.where('isActivated', '==', isActivated === 'true');
      }
      totalSnapshot = await countQuery.get();
    } else {
      totalSnapshot = await totalQuery.get();
    }

    return res.status(200).json({
      users,
      pagination: {
        total: totalSnapshot.size,
        limit,
        offset,
        hasMore: users.length === limit
      }
    });

  } catch (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Update membership level
app.post('/api/update-membership', async (req, res) => {
  const { walletAddress, membershipLevel, transactionHash } = req.body;

  if (!walletAddress || !membershipLevel || !transactionHash) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Validate membership level
  const validLevels = ['Based', 'Super Based', 'Legendary'];
  if (!validLevels.includes(membershipLevel)) {
    return res.status(400).json({ error: 'Invalid membership level' });
  }

  try {
    const accountRef = db.collection('accounts').doc(walletAddress);
    const accountDoc = await accountRef.get();

    if (!accountDoc.exists) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const accountData = accountDoc.data();

    if (!accountData.isActivated) {
      return res.status(400).json({ error: 'Account is not activated' });
    }

    // Update membership level
    await accountRef.update({
      membershipLevel: membershipLevel,
      lastUpgradeAt: new Date(),
      upgradeTransactionHash: transactionHash
    });

    return res.status(200).json({
      message: 'Membership level updated successfully',
      newLevel: membershipLevel
    });

  } catch (error) {
    console.error('Error updating membership level:', error);
    return res.status(500).json({ error: 'Failed to update membership level' });
  }
});

// Get invitation code usage count
app.get('/api/invitation-usage/:invitationCode', async (req, res) => {
  const invitationCode = req.params.invitationCode;

  if (!invitationCode) {
    return res.status(400).json({ error: 'Invitation code is required' });
  }

  try {
    // Get the inviter's account to check max uses
    const inviterQuery = db.collection('accounts')
      .where('invitationCode', '==', invitationCode)
      .limit(1);
    const inviterSnapshot = await inviterQuery.get();

    if (inviterSnapshot.empty) {
      return res.status(404).json({ error: 'Invitation code not found' });
    }

    const inviterData = inviterSnapshot.docs[0].data();
    const maxUses = inviterData.maxInvitationUses || 5;
    const currentUses = inviterData.currentInvitationUses || 0;

    // Get detailed usage history
    const usageQuery = db.collection('invitationUsage')
      .where('invitationCode', '==', invitationCode)
      .orderBy('usedAt', 'desc');
    const usageSnapshot = await usageQuery.get();
    
    const usageHistory = [];
    usageSnapshot.forEach(doc => {
      const data = doc.data();
      usageHistory.push({
        id: doc.id,
        usedBy: data.usedBy,
        usedAt: data.usedAt.toISOString(),
        inviterWallet: data.inviterWallet
      });
    });

    return res.status(200).json({
      invitationCode,
      totalUses: currentUses,
      maxUses: maxUses,
      remainingUses: maxUses - currentUses,
      usageHistory: usageHistory,
      inviterWallet: inviterData.walletAddress,
      isInviterActivated: inviterData.isActivated || false
    });

  } catch (error) {
    console.error('Error fetching invitation usage:', error);
    return res.status(500).json({ error: 'Failed to fetch invitation usage' });
  }
});

// Server start
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});