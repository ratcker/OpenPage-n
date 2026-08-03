import { Link } from 'react-router-dom';

import SiteLayout from '../components/SiteLayout.jsx';
import { GridIcon, ProfileIcon } from '../components/Icons.jsx';

// Лендинг
export default function LandingPage() {
  return (
    <SiteLayout>
      <div className="landing">
        <div className="landing-actions">
          <Link className="hub-button" to="/hub" aria-label="Перейти в хаб" title="Хаб">
            <GridIcon />
          </Link>
          <Link className="hub-button" to="/login" aria-label="Войти в аккаунт" title="Войти">
            <ProfileIcon />
          </Link>
        </div>
      </div>
    </SiteLayout>
  );
}
