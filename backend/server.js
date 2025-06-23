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
      lastCheckIn: null,
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
      lastCheckIn: null,
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
app.get('/api/profile/:walletAddress', async (req, res) => {
  const walletAddress = req.params.walletAddress;

  try {
    const doc = await db.collection('accounts').doc(walletAddress).get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const data = doc.data();
    
    const profileData = {
      walletAddress: data.walletAddress,
      membershipLevel: data.membershipLevel || 'Based',
      invitationCode: data.invitationCode || null,
      enbBalance: data.enbBalance || 0,
      lastCheckinTime: data.lastCheckIn instanceof admin.firestore.Timestamp
        ? data.lastCheckIn.toDate().toISOString()
        : null,
      consecutiveDays: data.consecutiveDays || 0,
      totalEarned: data.totalEarned || 0,
      joinDate: data.createdAt instanceof admin.firestore.Timestamp
        ? data.createdAt.toDate().toISOString()
        : new Date().toISOString()
    };

    return res.status(200).json(profileData);
  } catch (error) {
    console.error('Error fetching profile:', error);
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
});



// Check-in functionality
app.post('/api/checkin', async (req, res) => {
  const { walletAddress } = req.body;

  if (!walletAddress) {
    return res.status(400).json({ error: 'Missing wallet address' });
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
    
    // Check if user already checked in today
    if (accountData.lastCheckIn) {
      const lastCheckIn = accountData.lastCheckIn.toDate();
      const lastCheckInDate = new Date(lastCheckIn.getFullYear(), lastCheckIn.getMonth(), lastCheckIn.getDate());
      
      if (lastCheckInDate.getTime() === today.getTime()) {
        return res.status(400).json({ error: 'Already checked in today' });
      }
    }

    // Calculate consecutive days and rewards
    let consecutiveDays = 1;
    let enbReward = 10; // Base reward

    if (accountData.lastCheckIn) {
      const lastCheckIn = accountData.lastCheckIn.toDate();
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const lastCheckInDate = new Date(lastCheckIn.getFullYear(), lastCheckIn.getMonth(), lastCheckIn.getDate());

      if (lastCheckInDate.getTime() === yesterday.getTime()) {
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
      lastCheckIn: now,
      consecutiveDays: consecutiveDays,
      enbBalance: (accountData.enbBalance || 0) + finalReward,
      totalEarned: (accountData.totalEarned || 0) + finalReward
    });

    return res.status(200).json({
      message: 'Check-in successful',
      reward: finalReward,
      consecutiveDays: consecutiveDays,
      newBalance: (accountData.enbBalance || 0) + finalReward
    });

  } catch (error) {
    console.error('Error during check-in:', error);
    return res.status(500).json({ error: 'Failed to check in' });
  }
});

// Get check-in status
app.get('/api/checkin-status/:walletAddress', async (req, res) => {
  const walletAddress = req.params.walletAddress;

  try {
    const accountDoc = await db.collection('accounts').doc(walletAddress).get();

    if (!accountDoc.exists) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const accountData = accountDoc.data();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let canCheckIn = true;
    let lastCheckInToday = false;

    if (accountData.lastCheckIn) {
      const lastCheckIn = accountData.lastCheckIn.toDate();
      const lastCheckInDate = new Date(lastCheckIn.getFullYear(), lastCheckIn.getMonth(), lastCheckIn.getDate());
      
      if (lastCheckInDate.getTime() === today.getTime()) {
        canCheckIn = false;
        lastCheckInToday = true;
      }
    }

    return res.status(200).json({
      canCheckIn,
      lastCheckInToday,
      consecutiveDays: accountData.consecutiveDays || 0,
      lastCheckIn: accountData.lastCheckIn || null
    });

  } catch (error) {
    console.error('Error fetching check-in status:', error);
    return res.status(500).json({ error: 'Failed to fetch check-in status' });
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
        createdAt: data.createdAt ? data.createdAt.toISOString() : null,
        activatedAt: data.activatedAt ? data.activatedAt.toISOString() : null,
        lastCheckIn: data.lastCheckIn ? data.lastCheckIn.toISOString() : null
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

// Server start
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});