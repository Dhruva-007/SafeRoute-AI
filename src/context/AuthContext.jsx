import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import {
  registerUser,
  loginUser,
  verifyToken,
  saveSession,
  clearSession,
  getStoredToken,
  getStoredUser,
} from '../services/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  // 'initializing' = checking stored token on first load
  // 'idle'         = ready, no operation in progress
  const [authStatus, setAuthStatus] = useState('initializing');

  // ---------------------------------------------------------------------------
  // Session restoration on first load
  // Verify the stored JWT with the backend.
  // If backend is unreachable, fall back to stored user (offline support).
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const restoreSession = async () => {
      const token = getStoredToken();
      const storedUser = getStoredUser();

      if (!token || !storedUser) {
        setAuthStatus('idle');
        return;
      }

      // Optimistically set user from storage so protected pages load instantly
      setUser(storedUser);
      setIsLoggedIn(true);

      // Then verify with backend in background
      const verifiedUser = await verifyToken(token);

      if (verifiedUser) {
        // Update with fresh data from backend (name/email may have changed)
        setUser(verifiedUser);
        saveSession(verifiedUser, token);
      } else {
        // Token rejected by backend — clear session
        // Only clear if we got a definitive rejection (not a network error)
        // verifyToken returns null on both network error and 401
        // We keep the session if backend is unreachable (offline support)
        // but clear if we know the token is bad
        // Since verifyToken swallows network errors and returns null for both,
        // we do a conservative check: if backend is reachable and token failed,
        // clear. If backend is unreachable, keep stored session.
        if (navigator.onLine) {
          clearSession();
          setUser(null);
          setIsLoggedIn(false);
        }
        // If offline, keep the optimistic session set above
      }

      setAuthStatus('idle');
    };

    restoreSession();
  }, []);

  // ---------------------------------------------------------------------------
  // Login
  // ---------------------------------------------------------------------------

  const login = useCallback(async (email, password) => {
    const data = await loginUser(email, password);
    // loginUser throws on failure — if we get here, it succeeded

    saveSession(data.user, data.access_token);
    setUser(data.user);
    setIsLoggedIn(true);

    return data.user;
  }, []);

  // ---------------------------------------------------------------------------
  // Signup
  // ---------------------------------------------------------------------------

  const signup = useCallback(async (name, email, password) => {
    const data = await registerUser(name, email, password);
    // registerUser throws on failure

    saveSession(data.user, data.access_token);
    setUser(data.user);
    setIsLoggedIn(true);

    return data.user;
  }, []);

  // ---------------------------------------------------------------------------
  // Logout
  // ---------------------------------------------------------------------------

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
    setIsLoggedIn(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Loading screen — shown only during initial session restoration
  // ---------------------------------------------------------------------------

  if (authStatus === 'initializing') {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-text-muted">Loading SafeRoute AI...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{ isLoggedIn, user, login, signup, logout, authStatus }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}