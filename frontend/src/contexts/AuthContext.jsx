import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Helper to get storage based on rememberMe preference
const getStorage = () => {
  // Check if we have a token in localStorage (rememberMe was true)
  if (localStorage.getItem('auth_accessToken')) {
    return localStorage;
  }
  // Otherwise use sessionStorage
  return sessionStorage;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authProvider, setAuthProvider] = useState('local');

  // Listen for forced logout from API client (e.g. unrecoverable 401)
  useEffect(() => {
    const handleForceLogout = () => { clearAuth(); };
    window.addEventListener('auth:logout', handleForceLogout);
    return () => window.removeEventListener('auth:logout', handleForceLogout);
  }, []);

  // Fetch which auth provider is active
  useEffect(() => {
    fetch('/auth/provider')
      .then((r) => r.json())
      .then((data) => setAuthProvider(data.provider || 'local'))
      .catch(() => setAuthProvider('local'));
  }, []);

  // Handle OIDC callback (user returning from cloud IdP)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authCode = params.get('auth_code');
    const authError = params.get('auth_error');

    if (authError) {
      console.error('Auth callback error:', authError);
      window.history.replaceState({}, '', window.location.pathname);
      setLoading(false);
      return;
    }

    if (authCode) {
      // Exchange the one-time code for tokens
      fetch('/auth/exchange-callback-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: authCode }),
      })
        .then((r) => {
          if (!r.ok) throw new Error('Code exchange failed');
          return r.json();
        })
        .then((data) => {
          const storage = localStorage; // cloud auth always persists
          storage.setItem('auth_accessToken', data.accessToken);
          storage.setItem('auth_refreshToken', data.refreshToken);
          setUser(data.user);
          setIsAuthenticated(true);
          // Clean URL
          window.history.replaceState({}, '', window.location.pathname);
          setLoading(false);
        })
        .catch((err) => {
          console.error('OIDC code exchange failed:', err);
          window.history.replaceState({}, '', window.location.pathname);
          setLoading(false);
        });
      return; // skip the normal checkAuth while handling callback
    }

    // Normal auth check on mount
    checkAuth();
  }, []);

  const checkAuth = async () => {
    setLoading(true);
    const storage = getStorage();
    const accessToken = storage.getItem('auth_accessToken');

    if (accessToken) {
      try {
        const response = await fetch('/auth/me', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
          setIsAuthenticated(true);
        } else if (response.status === 401) {
          // Try to refresh token
          const refreshed = await refreshToken();
          if (!refreshed) {
            clearAuth();
          }
        } else {
          clearAuth();
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        clearAuth();
      }
    }

    setLoading(false);
  };

  const clearAuth = () => {
    localStorage.removeItem('auth_accessToken');
    localStorage.removeItem('auth_refreshToken');
    sessionStorage.removeItem('auth_accessToken');
    sessionStorage.removeItem('auth_refreshToken');
    setUser(null);
    setIsAuthenticated(false);
  };

  const login = async (username, password, rememberMe = false) => {
    const response = await fetch('/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }

    const data = await response.json();
    const { accessToken, refreshToken, user: userData } = data;

    // Store tokens based on rememberMe preference
    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem('auth_accessToken', accessToken);
    storage.setItem('auth_refreshToken', refreshToken);

    // Clear the other storage to avoid conflicts
    const otherStorage = rememberMe ? sessionStorage : localStorage;
    otherStorage.removeItem('auth_accessToken');
    otherStorage.removeItem('auth_refreshToken');

    setUser(userData);
    setIsAuthenticated(true);

    return userData;
  };

  const loginWithProvider = async () => {
    const response = await fetch('/auth/authorize');
    if (!response.ok) {
      throw new Error('Failed to get authorization URL');
    }
    const { url } = await response.json();
    window.location.href = url;
  };

  const logout = useCallback(() => {
    clearAuth();
  }, []);

  const refreshToken = async () => {
    const storage = getStorage();
    const currentRefreshToken = storage.getItem('auth_refreshToken');

    if (!currentRefreshToken) {
      return false;
    }

    try {
      const response = await fetch('/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken: currentRefreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        storage.setItem('auth_accessToken', data.accessToken);

        // Re-fetch user info with new token
        const meResponse = await fetch('/auth/me', {
          headers: {
            Authorization: `Bearer ${data.accessToken}`,
          },
        });

        if (meResponse.ok) {
          const userData = await meResponse.json();
          setUser(userData);
          setIsAuthenticated(true);
          return true;
        }
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
    }

    return false;
  };

  // Helper to check if user has a specific role
  const hasRole = (role) => {
    if (!user) return false;
    return user.role === role;
  };

  // Helper to check if user can access based on minimum role
  // Role hierarchy: admin > user > guest
  const canAccess = (minimumRole) => {
    if (!user) return false;

    const roleHierarchy = { guest: 1, user: 2, admin: 3 };
    const userLevel = roleHierarchy[user.role] || 0;
    const requiredLevel = roleHierarchy[minimumRole] || 0;

    return userLevel >= requiredLevel;
  };

  // Get current access token for API calls
  const getAccessToken = () => {
    const storage = getStorage();
    return storage.getItem('auth_accessToken');
  };

  const value = {
    user,
    isAuthenticated,
    loading,
    authProvider,
    login,
    loginWithProvider,
    logout,
    refreshToken,
    hasRole,
    canAccess,
    getAccessToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
