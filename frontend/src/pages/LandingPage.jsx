import SiteLayout from '../components/SiteLayout.jsx';
import { GridIcon, ProfileIcon } from '../components/Icons.jsx';

// Лендинг
export default function LandingPage() {
  return (
    <SiteLayout>
      <div className="landing">
        <div className="landing-actions">
          <a className="hub-button" href="/hub" aria-label="Перейти в хаб" title="Хаб">
            <GridIcon />
          </a>
          <a className="hub-button" href="/login" aria-label="Войти в аккаунт" title="Войти">
            <ProfileIcon />
          </a>
        </div>
      </div>
    </SiteLayout>
  );
}
