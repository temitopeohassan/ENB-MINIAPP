'use client';

import { useState } from 'react';

export function Create() {
  const [accountCreated, setAccountCreated] = useState(false);
  const [activationCode, setActivationCode] = useState('');

  const handleCreateAccount = () => {
    // TODO: Implement account creation logic
    setAccountCreated(true);
  };

  const handleActivateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement account activation logic
    console.log('Activating account with code:', activationCode);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-4">
      <h1 className="text-xl font-bold">Welcome To ENB Mini App</h1>
        
        {!accountCreated ? (
          <div className="space-y-4">
            <p>Create your mining account to start earning ENB</p>
            <button
              onClick={handleCreateAccount}
              className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              Create Mining Account
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p>Please activate your account</p>
            <form onSubmit={handleActivateAccount} className="space-y-4">
              <div>
                <input
                  type="text"
                  value={activationCode}
                  onChange={(e) => setActivationCode(e.target.value)}
                  placeholder="Enter activation code"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <button
                type="submit"
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Activate Account
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}