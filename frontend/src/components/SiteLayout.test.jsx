import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./Header/Header.jsx', () => ({
  default: () => <header>Шапка сайта</header>,
}));
vi.mock('./Footer/Footer.jsx', () => ({
  default: () => <footer>Подвал сайта</footer>,
}));

import SiteLayout from './SiteLayout.jsx';

describe('SiteLayout', () => {
  it('provides header, main content, footer and a skip link to the main region', () => {
    render(
      <SiteLayout>
        <h1>Основное содержимое</h1>
      </SiteLayout>,
    );

    expect(screen.getByRole('banner')).toHaveTextContent('Шапка сайта');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'content');
    expect(screen.getByRole('heading', { name: 'Основное содержимое' })).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Подвал сайта');
    expect(screen.getByRole('link', { name: 'К контенту' })).toHaveAttribute('href', '#content');
  });
});
