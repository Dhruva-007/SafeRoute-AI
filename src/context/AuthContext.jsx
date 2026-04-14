import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('saferoute_auth');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setIsLoggedIn(true);
        setUser(parsed);
      } catch (e) {
        localStorage.removeItem('saferoute_auth');
      }
    }
    setLoading(false);
  }, []);

  const login = (email, password) => {
    const userData = {
      id: '1',
      name: email.split('@')[0].charAt(0).toUpperCase() + email.split('@')[0].slice(1),
      email: email,
      avatar: null,
      joinedDate: new Date().toISOString(),
    };
    setUser(userData);
    setIsLoggedIn(true);
    localStorage.setItem('saferoute_auth', JSON.stringify(userData));
    return true;
  };

  const signup = (name, email, password) => {
    const userData = {
      id: '1',
      name: name,
      email: email,
      avatar: null,
      joinedDate: new Date().toISOString(),
    };
    setUser(userData);
    setIsLoggedIn(true);
    localStorage.setItem('saferoute_auth', JSON.stringify(userData));
    return true;
  };

  const logout = () => {
    setUser(null);
    setIsLoggedIn(false);
    localStorage.removeItem('saferoute_auth');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ isLoggedIn, user, login, signup, logout }}>
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