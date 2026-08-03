import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  clearSession,
  saveSession,
  subscribeToSession,
} from '../api/client.js';
import {
  login as requestLogin,
  logout as requestLogout,
  refresh,
} from '../api/auth.js';
import { AuthContext } from './useAuth.js';

// Общее состояние пользовательской сессии
export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    const unsubscribe = subscribeToSession((nextUser) => {
      setUser(nextUser);
      setStatus(nextUser ? 'authenticated' : 'anonymous');
    });

    // Single-flight защищает восстановление от двойного эффекта StrictMode.
    refresh().catch(() => {});

    return unsubscribe;
  }, []);

  const login = useCallback(async (email, password) => {
    const session = await requestLogin(email, password);
    saveSession(session);
    return session.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await requestLogout();
    } catch {
      // Локальная сессия завершается даже при недоступном сервере.
    } finally {
      clearSession();
    }
  }, []);

  const value = useMemo(
    () => ({ user, status, login, logout }),
    [user, status, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
