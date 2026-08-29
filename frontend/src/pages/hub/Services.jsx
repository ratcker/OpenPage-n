import { Link } from 'react-router-dom';

import knowledgeArtwork from '../../assets/knowledge-artwork.svg';

// Каталог
export default function Services() {
  return (
    <section className="services" id="services" aria-labelledby="services-title">
      <div className="container">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Сервисы</p>
            <h2 id="services-title">Каталог</h2>
          </div>
          <p>Выбирайте нужный сервис.</p>
        </div>

        <Link className="service-card" to="/knowledge">
          <div className="service-card-art" aria-hidden="true">
            <img src={knowledgeArtwork} alt="" />
          </div>

          <div className="service-card-content">
            <p className="service-card-kicker">Чтение и материалы</p>
            <h3>База знаний</h3>
            <p>Собирайте книги и статьи в одном пространстве.</p>

            <span className="service-card-link">
              Открыть
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="m7 4 6 6-6 6" />
              </svg>
            </span>
          </div>
        </Link>

        <div className="coming-soon" role="status">
          <svg className="coming-soon-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
            <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
            <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
            <path d="M17 14v6M14 17h6" />
          </svg>

          <div>
            <h3>Скоро</h3>
            <p>Готовим новые сервисы.</p>
          </div>

          <span className="status"><i />В работе</span>
        </div>
      </div>
    </section>
  );
}
