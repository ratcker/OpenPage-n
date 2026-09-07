import {
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';

import ProtectedRoute, { SessionLoading } from './auth/ProtectedRoute.jsx';
import useAuth from './auth/useAuth.js';
import HubPage from './pages/hub/HubPage.jsx';
import KnowledgePage from './pages/knowledge/KnowledgePage.jsx';
import PublicAuthorPage from './pages/knowledge/PublicAuthorPage.jsx';
import ReaderPage from './pages/knowledge/ReaderPage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage/LoginPage.jsx';
import ProfilePage from './pages/ProfilePage/ProfilePage.jsx';

// Авторизованному пользователю форма входа уже не нужна.
function LoginRoute() {
  const { status } = useAuth();
  const location = useLocation();
  const destination = location.state?.from || '/hub';

  if (status === 'loading') return <SessionLoading />;
  if (status === 'authenticated') return <Navigate to={destination} replace />;
  return <LoginPage />;
}

// Выбор страницы
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/hub" element={<HubPage />} />
      <Route path="/knowledge" element={<KnowledgePage />} />
      <Route path="/knowledge/authors/:publicId" element={<PublicAuthorPage />} />
      <Route path="/knowledge/books/:id/read" element={<ReaderPage />} />
      <Route
        path="/profile"
        element={(
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        )}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
