import {
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';

import ProtectedRoute, { SessionLoading } from './auth/ProtectedRoute/ProtectedRoute.jsx';
import useAuth from './auth/useAuth.js';
import HubPage from './pages/hub/HubPage/HubPage.jsx';
import ArticleEditorPage from './pages/knowledge/ArticleEditorPage/ArticleEditorPage.jsx';
import ArticlePage from './pages/knowledge/ArticlePage/ArticlePage.jsx';
import BookPage from './pages/knowledge/BookPage/BookPage.jsx';
import KnowledgePage from './pages/knowledge/KnowledgePage/KnowledgePage.jsx';
import LibraryPage from './pages/knowledge/LibraryPage/LibraryPage.jsx';
import PublicAuthorPage from './pages/knowledge/PublicAuthorPage/PublicAuthorPage.jsx';
import ReaderPage from './pages/knowledge/ReaderPage/ReaderPage.jsx';
import LoginPage from './pages/LoginPage/LoginPage/LoginPage.jsx';
import ProfilePage from './pages/ProfilePage/ProfilePage.jsx';
import RootPage from './pages/RootPage.jsx';

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
      <Route path="/" element={<RootPage />} />
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/hub" element={<HubPage />} />
      <Route path="/knowledge" element={<KnowledgePage />} />
      <Route path="/knowledge/authors/:publicId" element={<PublicAuthorPage />} />
      <Route path="/knowledge/articles/:id" element={<ArticlePage />} />
      <Route
        path="/knowledge/articles/new"
        element={(
          <ProtectedRoute>
            <ArticleEditorPage mode="create" />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/knowledge/articles/:id/edit"
        element={(
          <ProtectedRoute>
            <ArticleEditorPage mode="edit" />
          </ProtectedRoute>
        )}
      />
      <Route path="/knowledge/books/:id/read" element={<ReaderPage />} />
      <Route path="/knowledge/books/:id" element={<BookPage />} />
      <Route
        path="/knowledge/library"
        element={(
          <ProtectedRoute>
            <LibraryPage />
          </ProtectedRoute>
        )}
      />
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
