import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import AuthorProfile, { ProfileAvatar } from './AuthorProfile/AuthorProfile.jsx';

describe('AuthorProfile', () => {
  it('рендер состояния загрузки, анонимного пользователя, отсутствующего элемента и ошибки', () => {
    const { rerender } = render(<AuthorProfile state={{ status: 'loading' }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Загружаем профиль');

    rerender(<AuthorProfile state={{ status: 'anonymous' }} />);
    expect(screen.getByRole('heading', { name: 'Публичный каталог' })).toBeInTheDocument();

    rerender(<MemoryRouter><AuthorProfile state={{ status: 'missing' }} /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Профиль автора не создан' })).toBeInTheDocument();

    rerender(<AuthorProfile state={{ status: 'error' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить профиль');
  });

  it('вызывает profile и upload для читателя без профиля', () => {
    const onCreate = vi.fn();
    render(
      <MemoryRouter>
        <AuthorProfile state={{ status: 'missing' }} onCreate={onCreate} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Стать автором' }));

    expect(onCreate).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'Моя библиотека' })).toHaveAttribute('href', '/knowledge/library');
  });

  it('создает инициалы из максимум двух частей имени и использует запасной вариант, если имя пустое', () => {
    const { rerender } = render(<ProfileAvatar profile={{ display_name: 'Иван Петров Сидоров', avatar_url: '' }} />);
    expect(screen.getByText('ИП')).toBeInTheDocument();

    rerender(<ProfileAvatar profile={{ display_name: '   ', avatar_url: '' }} />);
    expect(screen.getByText('OP')).toBeInTheDocument();
  });

  it('использует инициалы в качестве запасного варианта, если изображение не удается загрузить аватар', () => {
    render(<ProfileAvatar profile={{ display_name: 'Иван Петров', avatar_url: '/avatar.png' }} />);
    fireEvent.error(screen.getByRole('img', { name: 'Аватар автора Иван Петров' }));

    expect(screen.getByText('ИП')).toBeInTheDocument();
  });
});
