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

  // Listen for forced logout from API client (e.g. unrecoverable 401)
  useEffect(() => {
    const handleForceLogout = () => { clearAuth(); };
    window.addEventListener('auth:logout', handleForceLogout);
    return () => window.removeEventListener('auth:logout', handleForceLogout);
  }, []);

  // Check for existing token on mount
  useEffect(() => {
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

    checkAuth();
  }, []);

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
    login,
    logout,
    refreshToken,
    hasRole,
    canAccess,
    getAccessToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
