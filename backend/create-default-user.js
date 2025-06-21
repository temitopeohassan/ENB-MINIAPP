// Script to create a default user with limited invitation code
import fetch from 'node-fetch';

const API_BASE_URL = 'https://enb-api.vercel.app'; // Update this to your API URL

const createDefaultUser = async () => {
  const defaultUserData = {
    walletAddress: '0x1234567890abcdef1234567890abcdef12345678', // Default wallet address
    invitationCode: 'ENB2025', // Your specific invitation code
    maxUses: 105 // Maximum number of times this code can be used
  };

  try {
    console.log('Creating default user...');
    console.log('Wallet Address:', defaultUserData.walletAddress);
    console.log('Invitation Code:', defaultUserData.invitationCode);
    console.log('Max Uses:', defaultUserData.maxUses);

    const response = await fetch(`${API_BASE_URL}/api/create-default-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(defaultUserData),
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Default user created successfully!');
      console.log('Response:', data);
    } else {
      console.error('❌ Failed to create default user');
      console.error('Error:', data.error);
    }
  } catch (error) {
    console.error('❌ Error creating default user:', error);
  }
};

// Run the script
createDefaultUser(); 