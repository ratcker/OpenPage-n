// Форма входа и регистрации
export default function AuthForm({
  mode,
  error,
  isLoading,
  onModeChange,
  onSubmit,
}) {
  const isRegistration = mode === 'register';
  const title = isRegistration ? 'Создать аккаунт' : 'Войти';
  const description = isRegistration
    ? 'Мы отправим код подтверждения на почту.'
    : 'Введите данные своего аккаунта.';
  const submitLabel = isLoading
    ? 'Подождите…'
    : isRegistration ? 'Зарегистрироваться' : 'Войти';

  return (
    <>
      <p className="eyebrow"><span />Аккаунт</p>
      <h1 id="login-title">{title}</h1>
      <p className="login-text">{description}</p>

      <form
        className="login-form"
        aria-busy={isLoading}
        onSubmit={onSubmit}
      >
        {error && <p className="login-error" role="alert">{error}</p>}

        {isRegistration && (
          <label>
            <span>Имя</span>
            <input
              type="text"
              name="name"
              autoComplete="name"
              placeholder="Ваше имя"
              disabled={isLoading}
              required
            />
          </label>
        )}

        <label>
          <span>Почта</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            placeholder="name@example.ru"
            disabled={isLoading}
            required
          />
        </label>

        <label>
          <span>Пароль</span>
          <input
            type="password"
            name="password"
            autoComplete={isRegistration ? 'new-password' : 'current-password'}
            placeholder="Введите пароль"
            disabled={isLoading}
            required
          />
        </label>

        {isRegistration && (
          <label>
            <span>Повторите пароль</span>
            <input
              type="password"
              name="password_confirm"
              autoComplete="new-password"
              placeholder="Повторите пароль"
              disabled={isLoading}
              required
            />
          </label>
        )}

        <button
          className="primary-button"
          type="submit"
          disabled={isLoading}
        >
          {submitLabel}
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m7 4 6 6-6 6" />
          </svg>
        </button>
      </form>

      <button
        className="login-switch"
        type="button"
        disabled={isLoading}
        onClick={onModeChange}
      >
        {isRegistration
          ? 'Уже есть аккаунт? Войти'
          : 'Нет аккаунта? Зарегистрироваться'}
      </button>
    </>
  );
}
