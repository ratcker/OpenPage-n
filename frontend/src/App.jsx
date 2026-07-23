import HubPage from './pages/hub/HubPage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';

// Выбор страницы
export default function App() {
  const path = window.location.pathname.replace(/\/$/, '');
  const pages = {
    '/hub': HubPage,
    '/login': LoginPage,
  };
  const Page = pages[path] || LandingPage;

  return <Page />;
}
