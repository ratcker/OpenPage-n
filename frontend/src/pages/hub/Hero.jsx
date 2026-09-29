// Первый экран
export default function Hero() {
  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <div className="container hero-content">
        <p className="eyebrow"><span />Опенпейч</p>
        <h1 id="hero-title">Расположите свой проект на Опенпейч</h1>
        <p className="hero-text">Опенпейч готов разместить ваш сервис у себя.</p>

        <div className="hero-actions">
          <button className="primary-button" type="button">
            Разместить проект
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m7 4 6 6-6 6" />
            </svg>
          </button>
          <button className="hero-secondary-action" type="button">
            Смотреть проекты
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m7 4 6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
