import { createContext, useContext, useMemo, useState } from 'react';
import { USERS } from '../data/seed';

// Demo login: pick a user. Replace with real authentication (JWT / SSO) in production.

const AuthContext = createContext(null);
const KEY = 'unifiedtree-scm-user';

export function AuthProvider({ children }) {
  const [userId, setUserId] = useState(() => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  });

  const value = useMemo(() => {
    const user = USERS.find((u) => u.id === userId) ?? null;
    const persist = (id) => {
      try {
        id ? localStorage.setItem(KEY, id) : localStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
      setUserId(id);
    };
    return { user, login: (id) => persist(id), logout: () => persist(null) };
  }, [userId]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
