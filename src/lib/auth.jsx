// Admin auth context: holds the current admin user, restores the session
// on load via /api/auth/me, and exposes login/logout + role helpers (RBAC).
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiFetch, setToken, clearToken, getToken } from './api.js';

// Permission map mirrors spec Part 4.1 server-side roles. The server is the
// source of truth; this is for UI gating only.
const ROLE_HOME = {
  owner: '/admin',
  manager: '/admin',
  reception: '/admin/verify',
  trainer: '/admin/clients',
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session on first load if a token exists.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const { user } = await apiFetch('/auth/me');
        if (active) setUser(user);
      } catch {
        clearToken();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (username, password) => {
    const { token, user } = await apiFetch('/auth/login', {
      method: 'POST',
      body: { username, password },
      auth: false,
    });
    setToken(token);
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const hasRole = useCallback((roles) => !!user && roles.includes(user.role), [user]);

  const homeFor = useCallback(
    (u = user) => (u ? ROLE_HOME[u.role] || '/admin' : '/admin/login'),
    [user]
  );

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasRole, homeFor }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
