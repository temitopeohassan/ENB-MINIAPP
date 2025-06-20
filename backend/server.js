// server.js
import express from 'express';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import cors from 'cors';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Load env vars from .env file
dotenv.config();

// Firebase Admin SDK initialization
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Basic route
app.get('/', (req, res) => {
  res.send('ENB Token Platform API is running.');
});

// Create user account
app.post('/api/create-account', async (req, res) => {
  const { walletAddress, transactionHash } = req.body;

  if (!walletAddress || !transactionHash) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    await db.collection('accounts').doc(walletAddress).set({
      walletAddress,
      transactionHash,
      membershipLevel: 'Based',
      createdAt: new Date(),
      lastCheckIn: null,
      consecutiveDays: 0
    });

    return res.status(201).json({ message: 'Account created successfully' });
  } catch (error) {
    console.error('Error creating account:', error);
    return res.status(500).json({ error: 'Failed to create account' });
  }
});

// Get user profile
app.get('/api/profile/:walletAddress', async (req, res) => {
  const walletAddress = req.params.walletAddress;

  try {
    const doc = await db.collection('accounts').doc(walletAddress).get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Account not found' });
    }

    return res.status(200).json(doc.data());
  } catch (error) {
    console.error('Error fetching profile:', error);
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Server start
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
