import HubPage from './pages/hub/HubPage.jsx';
import LandingPage from './pages/LandingPage.jsx';

// Выбор страницы
export default function App() {
  const path = window.location.pathname.replace(/\/$/, '');
  const Page = path === '/hub' ? HubPage : LandingPage;

  return <Page />;
}
