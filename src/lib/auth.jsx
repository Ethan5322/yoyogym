// Admin auth context: holds the current admin user, restores the session
// on load via /api/auth/me, and exposes login/logout + role helpers (RBAC).
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiFetch } from './api.js';
import { clearGym } from './gym.js';

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
  // The gym's plan — { key, features } — or null in single-gym mode, where
  // nothing is gated. UX only: the routers enforce (CLAUDE.md §18.4).
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);

  // Login answers with the user but not the plan, so the plan is asked for
  // separately. A failure leaves plan null: every screen shown, and the
  // server still refuses what the plan does not include.
  const loadPlan = useCallback(() => {
    apiFetch('/auth/me').then((d) => setPlan(d.plan ?? null)).catch(() => {});
  }, []);

  // Restore the session on first load. It is an HttpOnly cookie this page
  // cannot see (CLAUDE.md §46.1 Q1), so the server is asked; a 401 simply
  // means nobody is signed in here.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { user, plan } = await apiFetch('/auth/me');
        if (active) {
          setUser(user);
          setPlan(plan ?? null);
        }
      } catch {
        /* not signed in */
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // `remember`: in the phone app, stay signed in until signing out (§38.1 Q3).
  const login = useCallback(async (username, password, { remember = false } = {}) => {
    // The server keeps the session in its cookie; the token in the answer is
    // for the store app and is not kept here.
    const { user } = await apiFetch('/auth/login', {
      method: 'POST',
      body: { username, password, remember },
    });
    setUser(user);
    loadPlan();
    return user;
  }, [loadPlan]);

  // Apply a session another sign-in opened (face sign-in): its cookie is
  // already set by the server.
  const applySession = useCallback((_token, user) => {
    setUser(user);
    loadPlan();
    return user;
  }, [loadPlan]);

  const logout = useCallback(() => {
    // Only the server can remove an HttpOnly cookie.
    apiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
    // Forget the gym too. A reception computer is shared, and leaving one
    // gym selected would have the next person working against it.
    //
    // NOT done on an expired token above: that person is still standing in
    // the same gym, they just need to sign in again.
    clearGym();
    setUser(null);
    setPlan(null);
  }, []);

  /** Is this feature in the gym's plan? Always true when nothing is gated. */
  const hasFeature = useCallback((feature) => !plan || !feature || plan.features.includes(feature), [plan]);

  const hasRole = useCallback((roles) => !!user && roles.includes(user.role), [user]);

  const homeFor = useCallback(
    (u = user) => (u ? ROLE_HOME[u.role] || '/admin' : '/admin/login'),
    [user]
  );

  return (
    <AuthContext.Provider value={{ user, plan, loading, login, applySession, logout, hasRole, hasFeature, homeFor }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
