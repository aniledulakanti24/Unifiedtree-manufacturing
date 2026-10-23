import { createContext, useContext, useMemo, useState, useSyncExternalStore } from 'react';
import { getUsers, subscribeUsers } from '../data/users';

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
  // The admin can rename, re-role or remove people, so the signed-in user is looked up in the live list.
  const users = useSyncExternalStore(subscribeUsers, getUsers);

  const value = useMemo(() => {
    const user = users.find((u) => u.id === userId) ?? null;
    const persist = (id) => {
      try {
        id ? localStorage.setItem(KEY, id) : localStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
      setUserId(id);
    };
    return { user, users, login: (id) => persist(id), logout: () => persist(null) };
  }, [userId, users]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
