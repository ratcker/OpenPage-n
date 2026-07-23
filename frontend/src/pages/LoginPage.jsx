import SiteLayout from '../components/SiteLayout.jsx';

// Вход в аккаунт
export default function LoginPage() {
  function handleSubmit(event) {
    event.preventDefault();
  }

  return (
    <SiteLayout>
      <section className="login" aria-labelledby="login-title">
        <div className="login-content">
          <p className="eyebrow"><span />Аккаунт</p>
          <h1 id="login-title">Войти</h1>
          <p className="login-text">Введите данные своего аккаунта.</p>

          <form className="login-form" onSubmit={handleSubmit}>
            <label>
              <span>Почта</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="name@example.ru"
                required
              />
            </label>

            <label>
              <span>Пароль</span>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder="Введите пароль"
                required
              />
            </label>

            <button className="primary-button" type="submit">
              Войти
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="m7 4 6 6-6 6" />
              </svg>
            </button>
          </form>
        </div>
      </section>
    </SiteLayout>
  );
}
