import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('../useAuth.js', () => ({ default: vi.fn() }));

import useAuth from '../useAuth.js';
import ProtectedRoute, { SessionLoading } from './ProtectedRoute.jsx';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function LoginDestination() {
  const location = useLocation();
  return <p>from: {location.state?.from?.pathname || 'none'}</p>;
}

describe('ProtectedRoute', () => {
  it('shows a status message while the session is being restored', () => {
    useAuth.mockReturnValue({ status: 'loading' });
    render(<MemoryRouter><ProtectedRoute><p>private content</p></ProtectedRoute></MemoryRouter>);

    expect(screen.getByRole('status')).toHaveTextContent('Проверяем сессию');
    expect(screen.queryByText('private content')).not.toBeInTheDocument();
  });

  it('redirects anonymous users to login and remembers the requested location', () => {
    useAuth.mockReturnValue({ status: 'anonymous' });
    render(
      <MemoryRouter initialEntries={['/knowledge/books/42?tab=info']}>
        <Routes>
          <Route path="/knowledge/books/:id" element={(
            <ProtectedRoute><p>private content</p></ProtectedRoute>
          )} />
          <Route path="/login" element={<LoginDestination />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('from: /knowledge/books/42')).toBeInTheDocument();
    expect(screen.queryByText('private content')).not.toBeInTheDocument();
  });

  it('рендерит защищённый контент для авторизованного пользователя', () => {
    useAuth.mockReturnValue({ status: 'authenticated' });
    render(<MemoryRouter><ProtectedRoute><p>private content</p></ProtectedRoute></MemoryRouter>);

    expect(screen.getByText('private content')).toBeInTheDocument();
  });

  it('экспортирует standalone-компонент загрузки с ARIA-ролью status для обеспечения доступности', () => {
    render(<SessionLoading />);
    expect(screen.getByRole('status')).toHaveTextContent('Проверяем сессию');
  });
});
