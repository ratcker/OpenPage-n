import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import AuthForm from './AuthForm.jsx';

const defaultProps = {
  mode: 'login',
  error: '',
  isLoading: false,
  onModeChange: vi.fn(),
  onSubmit: vi.fn((event) => event.preventDefault()),
};

describe('AuthForm', () => {
  it('рендерит login поле с browser-friendly autocomplete attributes', () => {
    render(<AuthForm {...defaultProps} />);

    expect(screen.getByRole('heading', { name: 'Войти' })).toBeInTheDocument();
    expect(screen.getByLabelText('Почта')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText('Пароль')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.queryByLabelText('Имя')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Повторите пароль')).not.toBeInTheDocument();
  });

  it('показывает поле регистрации и new-password автозаполнение', () => {
    render(<AuthForm {...defaultProps} mode="register" />);

    expect(screen.getByRole('heading', { name: 'Создать аккаунт' })).toBeInTheDocument();
    expect(screen.getByLabelText('Имя')).toBeRequired();
    expect(screen.getByLabelText('Повторите пароль')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('Пароль')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByRole('button', { name: 'Зарегистрироваться' })).toBeInTheDocument();
  });

  it('выводит errors, отключает вводы и сообщает о busy state', () => {
    const { container } = render(<AuthForm {...defaultProps} error="Неверный пароль" isLoading />);

    expect(screen.getByRole('alert')).toHaveTextContent('Неверный пароль');
    expect(container.querySelector('form')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText('Почта')).toBeDisabled();
    expect(screen.getByLabelText('Пароль')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Подождите…' })).toBeDisabled();
  });

});