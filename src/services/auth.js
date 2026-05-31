/**
 * Auth Service
 * Single source of truth for authentication API calls.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const AUTH_TOKEN_KEY = 'saferoute_token';
const AUTH_USER_KEY = 'saferoute_user';

// ---------------------------------------------------------------------------
// Token storage helpers
// ---------------------------------------------------------------------------

export const saveSession = (user, token) => {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
};

export const clearSession = () => {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
};

export const getStoredToken = () => {
  return localStorage.getItem(AUTH_TOKEN_KEY);
};

export const getStoredUser = () => {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const getAuthHeaders = () => {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// ---------------------------------------------------------------------------
// API calls — Registration & Login
// ---------------------------------------------------------------------------

export const registerUser = async (name, email, password) => {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(extractErrorMessage(data));
  return data;
};

export const loginUser = async (email, password) => {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(extractErrorMessage(data));
  return data;
};

export const verifyToken = async (token) => {
  if (!token) return null;
  try {
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// API calls — Profile management
// ---------------------------------------------------------------------------

export const updateProfile = async (name) => {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ name }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(extractErrorMessage(data));
  return data;
};

export const changePassword = async (currentPassword, newPassword) => {
  const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(extractErrorMessage(data));
  return data;
};

export const deleteAccount = async () => {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    method: 'DELETE',
    headers: { ...getAuthHeaders() },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(extractErrorMessage(data));
  return data;
};

// ---------------------------------------------------------------------------
// API calls — Password reset
// ---------------------------------------------------------------------------

export const requestPasswordReset = async (email) => {
  const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(extractErrorMessage(data));
  return data;
};

export const resetPasswordWithToken = async (token, newPassword) => {
  const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, new_password: newPassword }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(extractErrorMessage(data));
  return data;
};

// ---------------------------------------------------------------------------
// Error extraction
// ---------------------------------------------------------------------------

const extractErrorMessage = (data) => {
  if (!data?.detail) return 'Something went wrong. Please try again.';
  if (typeof data.detail === 'string') return data.detail;
  if (Array.isArray(data.detail)) {
    return data.detail
      .map((err) => {
        const field = err.loc?.slice(-1)[0];
        const fieldLabel = field && field !== 'body' ? `${field}: ` : '';
        return `${fieldLabel}${err.msg}`;
      })
      .join(' · ');
  }
  return 'Something went wrong. Please try again.';
};