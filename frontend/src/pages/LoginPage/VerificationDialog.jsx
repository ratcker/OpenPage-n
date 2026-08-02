// Подтверждение почты
export default function VerificationDialog({
  email,
  error,
  isLoading,
  onSubmit,
}) {
  function handleSubmit(event) {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget).get('code'));
  }

  return (
    <div className="verification-backdrop">
      <section
        className="verification-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="verification-title"
      >
        <h2 id="verification-title">Проверьте почту</h2>
        <p>Введите код, который мы отправили на {email}.</p>

        <form
          className="login-form verification-form"
          aria-busy={isLoading}
          onSubmit={handleSubmit}
        >
          {error && <p className="login-error" role="alert">{error}</p>}

          <label>
            <span>Код подтверждения</span>
            <input
              type="text"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              disabled={isLoading}
              autoFocus
              required
            />
          </label>

          <button
            className="primary-button"
            type="submit"
            disabled={isLoading}
          >
            {isLoading ? 'Проверяем…' : 'Подтвердить'}
          </button>
        </form>
      </section>
    </div>
  );
}
