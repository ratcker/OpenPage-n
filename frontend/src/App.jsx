import { Navigate, Route, Routes } from 'react-router-dom';

import HubPage from './pages/hub/HubPage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage/LoginPage.jsx';

// Выбор страницы
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/hub" element={<HubPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
