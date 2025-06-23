import admin from 'firebase-admin';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';

dotenv.config();

if (admin.apps.length === 0) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  initializeApp({
    credential: cert(serviceAccount),
  });
}

const db = getFirestore();

export const getGameStatus = async () => {
  try {
    const gameStatusRef = db.collection('gameStatus').doc('current');
    const doc = await gameStatusRef.get();
    return doc.exists ? doc.data() : null;
  } catch (error) {
    console.error('Error getting game status:', error);
    throw error;
  }
};

export const updateGameStatus = async (status) => {
  try {
    const gameStatusRef = db.collection('gameStatus').doc('current');
    await gameStatusRef.set(status, { merge: true });
    return true;
  } catch (error) {
    console.error('Error updating game status:', error);
    throw error;
  }
};

export const getVotingData = async () => {
  try {
    const votingRef = db.collection('voting').doc('current');
    const doc = await votingRef.get();
    return doc.exists ? doc.data() : null;
  } catch (error) {
    console.error('Error getting voting data:', error);
    throw error;
  }
};

export const submitVote = async (voterId, votedForId) => {
  try {
    const votingRef = db.collection('voting').doc('current');
    await votingRef.update({
      votes: admin.firestore.FieldValue.arrayUnion({
        voterId,
        votedForId,
        timestamp: new Date(),
      }),
    });
    return true;
  } catch (error) {
    console.error('Error submitting vote:', error);
    throw error;
  }
};

export const getLeaderboard = async () => {
  try {
    const leaderboardRef = db.collection('leaderboard');
    const snapshot = await leaderboardRef.orderBy('score', 'desc').limit(100).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    throw error;
  }
};

export const updatePlayerScore = async (playerId, score) => {
  try {
    const playerRef = db.collection('leaderboard').doc(playerId);
    await playerRef.set({ score }, { merge: true });
    return true;
  } catch (error) {
    console.error('Error updating player score:', error);
    throw error;
  }
};

export const getPlayerProfile = async (playerId) => {
  try {
    const profileRef = db.collection('profiles').doc(playerId);
    const doc = await profileRef.get();
    return doc.exists ? doc.data() : null;
  } catch (error) {
    console.error('Error getting player profile:', error);
    throw error;
  }
};

export const updatePlayerProfile = async (playerId, profileData) => {
  try {
    const profileRef = db.collection('profiles').doc(playerId);
    await profileRef.set(profileData, { merge: true });
    return true;
  } catch (error) {
    console.error('Error updating player profile:', error);
    throw error;
  }
};

export const getRewardsData = async () => {
  try {
    const rewardsRef = db.collection('rewards').doc('current');
    const doc = await rewardsRef.get();
    return doc.exists ? doc.data() : null;
  } catch (error) {
    console.error('Error getting rewards data:', error);
    throw error;
  }
};

export const updateRewardsData = async (rewardsData) => {
  try {
    const rewardsRef = db.collection('rewards').doc('current');
    await rewardsRef.set(rewardsData, { merge: true });
    return true;
  } catch (error) {
    console.error('Error updating rewards data:', error);
    throw error;
  }
};

export const getGameRules = async () => {
  try {
    const rulesRef = db.collection('gameRules').doc('current');
    const doc = await rulesRef.get();
    return doc.exists ? doc.data() : null;
  } catch (error) {
    console.error('Error getting game rules:', error);
    throw error;
  }
};

export const updateGameRules = async (rules) => {
  try {
    const rulesRef = db.collection('gameRules').doc('current');
    await rulesRef.set(rules, { merge: true });
    return true;
  } catch (error) {
    console.error('Error updating game rules:', error);
    throw error;
  }
}; 