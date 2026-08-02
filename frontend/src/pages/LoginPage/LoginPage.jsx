import { useRef, useState } from 'react';

import { login, register, verifyEmail } from '../../api/auth.js';
import SiteLayout from '../../components/SiteLayout.jsx';
import AuthForm from './AuthForm.jsx';
import VerificationDialog from './VerificationDialog.jsx';

// Вход и регистрация
export default function LoginPage() {
  const [mode, setMode] = useState('login');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [verificationError, setVerificationError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  // Исходный пароль живёт только до автоматического входа.
  const registrationPassword = useRef('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setIsLoading(true);

    const data = Object.fromEntries(new FormData(event.currentTarget));

    try {
      if (mode === 'register') {
        const result = await register(data);
        registrationPassword.current = data.password;
        setPendingEmail(result.email);
        return;
      }

      await login(data.email, data.password);

      // Refresh-токен уже сохранён в HttpOnly cookie.
      window.location.assign('/hub');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  function handleModeChange() {
    setMode(mode === 'login' ? 'register' : 'login');
    setError('');
  }

  async function handleVerification(code) {
    setVerificationError('');
    setIsVerifying(true);
    let isVerified = false;

    try {
      await verifyEmail(pendingEmail, code);
      isVerified = true;
      await login(pendingEmail, registrationPassword.current);
      registrationPassword.current = '';
      window.location.assign('/hub');
    } catch (requestError) {
      if (isVerified) {
        registrationPassword.current = '';
        setPendingEmail('');
        setMode('login');
        setError('Почта подтверждена. Теперь войдите в аккаунт.');
      } else {
        setVerificationError(requestError.message);
      }
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <SiteLayout>
      <section className="login" aria-labelledby="login-title">
        <div className="login-content">
          <AuthForm
            key={mode}
            mode={mode}
            error={error}
            isLoading={isLoading}
            onModeChange={handleModeChange}
            onSubmit={handleSubmit}
          />
        </div>
      </section>

      {pendingEmail && (
        <VerificationDialog
          email={pendingEmail}
          error={verificationError}
          isLoading={isVerifying}
          onSubmit={handleVerification}
        />
      )}
    </SiteLayout>
  );
}
