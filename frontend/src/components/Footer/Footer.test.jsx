import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../BrandMark.jsx', () => ({
  default: () => <span>Опенпейч</span>,
}));

import Footer from './Footer.jsx';

describe('Footer', () => {
  it('рендерит бренд, дескриптор сервиса и public domain в landmark-области футера', () => {
    render(<Footer />);

    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent('Опенпейч');
    expect(footer).toHaveTextContent('Цифровые сервисы');
    expect(footer).toHaveTextContent('опенпейч.рф');
  });
});
