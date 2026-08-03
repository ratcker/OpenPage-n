import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import useAuth from '../../auth/useAuth.js';
import SiteLayout from '../../components/SiteLayout.jsx';

// Страница профиля
export default function ProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogout() {
    setIsLoading(true);
    await logout();
    navigate('/', { replace: true });
  }

  return (
    <SiteLayout>
      <section className="profile-page">
        <div className="container profile-content">
          <p className="eyebrow"><span />Аккаунт</p>
          <h1>Профиль</h1>

          <dl className="profile-data">
            <div>
              <dt>Имя</dt>
              <dd>{user.name}</dd>
            </div>
            <div>
              <dt>Почта</dt>
              <dd>{user.email}</dd>
            </div>
          </dl>

          <button
            className="primary-button profile-logout"
            type="button"
            disabled={isLoading}
            onClick={handleLogout}
          >
            {isLoading ? 'Выходим…' : 'Выйти'}
          </button>
        </div>
      </section>
    </SiteLayout>
  );
}
