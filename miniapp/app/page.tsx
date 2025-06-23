const renderMainComponent = () => {
  if (!isConnected || !address) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Connecting wallet...</p>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      </div>
    );
  }

  if (profileState === 'loading') {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Loading profile...</p>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      </div>
    );
  }

  if (profileState === 'error') {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="text-center">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-sm mx-auto">
            <Icon name="arrow-right" size="lg" className="text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-red-800 mb-2">Error Loading Profile</h3>
            <p className="text-red-600 text-sm mb-4">{apiError}</p>
            <Button 
              onClick={() => fetchUserProfile(address)} 
              variant="ghost" 
              size="sm"
              className="text-red-600 hover:text-red-700"
            >
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (profileState === 'not-found') {
    return <Create refreshUserAccountAction={refreshUserProfile} />;
  }

  // Debug: Add console logs to see what's happening
  console.log('Debug - profileState:', profileState);
  console.log('Debug - userProfile:', userProfile);
  console.log('Debug - isActivated:', userProfile?.isActivated);

  if (profileState === 'found' && userProfile) {
    if (userProfile.isActivated === true) {
      console.log('Debug - Rendering Account component');
      return <Account userProfile={userProfile} />;
    } else {
      console.log('Debug - Rendering Create component (not activated)');
      return <Create refreshUserAccountAction={refreshUserProfile} />;
    }
  }

  // Fallback case - this should help identify the issue
  console.log('Debug - Falling back to loading state');
  console.log('Debug - Current state:', { profileState, userProfile, isActivated: userProfile?.isActivated });
  
  return (
    <div className="flex justify-center items-center py-20">
      <div className="text-center">
        <p className="text-gray-500">Unexpected state</p>
        <p className="text-xs text-gray-400 mt-2">
          State: {profileState}, Profile: {userProfile ? 'exists' : 'null'}, 
          Activated: {userProfile?.isActivated?.toString()}
        </p>
      </div>
    </div>
  );
};