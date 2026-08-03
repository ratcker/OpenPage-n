import { Link } from 'react-router-dom';

import BrandMark from './BrandMark.jsx';

// Шапка
export default function Header() {
  return (
    <header className="header">
      <div className="container header-inner">
        <Link to="/" aria-label="На лендинг">
          <BrandMark />
        </Link>

        <div className="header-actions">
          <nav className="nav" aria-label="Навигация">
            <Link to="/hub">Хаб</Link>
            <Link to="/hub#services">Сервисы</Link>
          </nav>

          <Link className="profile" to="/profile">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M10 10.1a3.55 3.55 0 1 0 0-7.1 3.55 3.55 0 0 0 0 7.1Zm-6 6.8c.38-3.02 2.87-4.85 6-4.85s5.62 1.83 6 4.85" />
            </svg>
            <span>Профиль</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
