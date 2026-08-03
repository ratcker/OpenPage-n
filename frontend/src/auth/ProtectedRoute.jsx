import { Navigate, useLocation } from 'react-router-dom';

import useAuth from './useAuth.js';

export function SessionLoading() {
  return <div className="session-loading" role="status">Проверяем сессию…</div>;
}

// Доступ к закрытым страницам
export default function ProtectedRoute({ children }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <SessionLoading />;
  if (status === 'anonymous') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
