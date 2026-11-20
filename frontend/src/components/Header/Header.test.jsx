import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../BrandMark.jsx', () => ({
  default: () => <span>Опенпейч</span>,
}));

import Header from './Header.jsx';

describe('Header', () => {
  it('отображает название, навигацию хаба и ссылку на профиль с постоянными маршрутами', () => {
    render(<MemoryRouter><Header /></MemoryRouter>);

    expect(screen.getByRole('link', { name: 'На лендинг' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('navigation', { name: 'Навигация' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Хаб' })).toHaveAttribute('href', '/hub');
    expect(screen.getByRole('link', { name: 'Профиль' })).toHaveAttribute('href', '/profile');
    expect(screen.getByText('Опенпейч')).toBeInTheDocument();
  });
});
