// services/firebase.js
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  initializeApp({
    credential: cert(serviceAccount)
  });
}

export const db = getFirestore();

/**
 * Helpers for account logic
 */
export const getAccount = async (walletAddress) => {
  const doc = await db.collection('accounts').doc(walletAddress).get();
  return doc.exists ? doc.data() : null;
};

export const createAccount = async (walletAddress, data) => {
  await db.collection('accounts').doc(walletAddress).set(data);
};

export const updateAccount = async (walletAddress, updates) => {
  await db.collection('accounts').doc(walletAddress).update(updates);
};

/**
 * Invitation logic
 */
export const isInvitationCodeUnique = async (code) => {
  const snapshot = await db.collection('accounts')
    .where('invitationCode', '==', code)
    .limit(1)
    .get();
  return snapshot.empty;
};

export const findInviterByCode = async (code) => {
  const snapshot = await db.collection('accounts')
    .where('invitationCode', '==', code)
    .limit(1)
    .get();
  return snapshot.empty ? null : snapshot.docs[0].data();
};

export const logInvitationUsage = (usageData) => {
  return db.collection('invitationUsage').add(usageData);
};

export const getInvitationUsagesInLast24h = async (invitationCode) => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const snapshot = await db.collection('invitationUsage')
    .where('invitationCode', '==', invitationCode)
    .where('usedAt', '>', since)
    .get();
  return snapshot.docs.map(doc => doc.data());
};

/**
 * Check-in logic
 */
export const getCheckinStatus = async (walletAddress) => {
  const account = await getAccount(walletAddress);
  return account?.lastCheckIn || null;
};

/**
 * Transaction and balance logic
 */
export const updateBalance = async (walletAddress, newBalance) => {
  return db.collection('accounts').doc(walletAddress).update({ enbBalance: newBalance });
};

export const recordTransaction = async (data) => {
  return db.collection('transactions').add(data);
};

export const getTransactions = async (walletAddress, limit = 50) => {
  const snapshot = await db.collection('transactions')
    .where('walletAddress', '==', walletAddress)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    timestamp: doc.data().timestamp.toISOString()
  }));
};

/**
 * Leaderboard logic
 */
export const getTopAccountsBy = async (field, limit = 50) => {
  const snapshot = await db.collection('accounts')
    .where('isActivated', '==', true)
    .orderBy(field, 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc, index) => ({
    rank: index + 1,
    ...doc.data()
  }));
};

export const getRankAbove = async (walletAddress, field) => {
  const account = await getAccount(walletAddress);
  const value = account?.[field] || 0;

  const snapshot = await db.collection('accounts')
    .where('isActivated', '==', true)
    .where(field, '>', value)
    .get();

  return snapshot.size + 1;
};

/**
 * Admin / Filtering
 */
export const getFilteredUsers = async ({ membershipLevel, isActivated, limit = 100, offset = 0 }) => {
  let query = db.collection('accounts');

  if (membershipLevel) query = query.where('membershipLevel', '==', membershipLevel);
  if (isActivated !== undefined) query = query.where('isActivated', '==', isActivated === 'true');

  query = query.orderBy('createdAt', 'desc').limit(limit); // Firestore doesn't support offset well

  const snapshot = await query.get();
  const users = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  return users;
};

export const getTotalUsersCount = async ({ membershipLevel, isActivated }) => {
  let query = db.collection('accounts');
  if (membershipLevel) query = query.where('membershipLevel', '==', membershipLevel);
  if (isActivated !== undefined) query = query.where('isActivated', '==', isActivated === 'true');

  const snapshot = await query.get();
  return snapshot.size;
};
