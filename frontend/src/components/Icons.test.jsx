import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GridIcon, ProfileIcon } from './Icons.jsx';

describe('decorative icons', () => {
  it('отображает сетку в виде скрытого четырёхъячеистого SVG и передаёт её класс дальше»', () => {
    const { container } = render(<GridIcon className="catalog-icon" />);
    const icon = container.querySelector('svg');

    expect(icon).toHaveClass('catalog-icon');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon.querySelectorAll('rect')).toHaveLength(4);
  });

  it('помечает SVG профиль как декоративное изображение для ассистивных технологий', () => {
    const { container } = render(<ProfileIcon />);
    const icon = container.querySelector('svg');

    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon.querySelectorAll('path')).toHaveLength(1);
  });
});
