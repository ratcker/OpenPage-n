// Первый экран
export default function Hero() {
  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <div className="container hero-content">
        <p className="eyebrow"><span />Опенпейч</p>
        <h1 id="hero-title">Сервисы рядом</h1>
        <p className="hero-text">Всё нужное в одном месте.</p>

        <div className="hero-actions">
          <a className="primary-button" href="#services">
            Смотреть
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m7 4 6 6-6 6" />
            </svg>
          </a>
          <span>Скоро больше</span>
        </div>
      </div>
    </section>
  );
}
