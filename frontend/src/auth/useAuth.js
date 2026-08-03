import { createContext, useContext } from 'react';

export const AuthContext = createContext(null);

// Доступ к текущей сессии
export default function useAuth() {
  const auth = useContext(AuthContext);

  if (!auth) throw new Error('useAuth должен использоваться внутри AuthProvider.');
  return auth;
}
