import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import ArticleCard, { firstArticleImage } from './ArticleCard.jsx';

const firstImageUrl = '/api/knowledge/article-images/4a393183-34b5-4d75-af1e-625237256096/';
const secondImageUrl = '/api/knowledge/article-images/763ccb25-bd38-49fd-b1cb-1458aa4b4738/';

const article = {
  id: 'eb56e24a-6c4c-4dbf-903c-768df56e1ed4',
  title: 'Статья с иллюстрацией',
  body: 'Текст статьи.',
  visibility: 'public',
  author: { id: null, display_name: 'Автор' },
  created_at: '2026-09-08T12:00:00Z',
};

function renderCard(changes = {}) {
  const currentArticle = { ...article, ...changes };
  return render(
    <MemoryRouter>
      <ArticleCard article={currentArticle} />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('ArticleCard', () => {
  it('показывает первую картинку публичной статьи с alt и lazy loading', () => {
    renderCard({
      body: [
        `![Первая схема](${firstImageUrl})`,
        'Текст между изображениями.',
        `![Вторая схема](${secondImageUrl})`,
      ].join('\n\n'),
    });

    const preview = screen.getByRole('img', { name: 'Первая схема' });
    expect(preview).toHaveAttribute('src', firstImageUrl);
    expect(preview).toHaveAttribute('loading', 'lazy');
    expect(preview).toHaveClass('article-card-preview');
    expect(screen.queryByRole('img', { name: 'Вторая схема' })).not.toBeInTheDocument();
    expect(screen.getByText('Текст между изображениями.')).toBeInTheDocument();
    expect(screen.queryByText(/!\[/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: `Читать «${article.title}»` }))
      .toHaveAttribute('href', `/knowledge/articles/${article.id}`);
  });

  it('использует fallback-alt для картинки без описания', () => {
    renderCard({ body: `![](${firstImageUrl})` });

    expect(screen.getByRole('img', {
      name: `Иллюстрация к статье «${article.title}»`,
    })).toHaveAttribute('src', firstImageUrl);
  });

  it.each([
    ['обычная ссылка', `[Ссылка](${firstImageUrl})`],
    ['статья без картинки', 'Только обычный текст.'],
    ['повреждённый Markdown', '![Не закрыто]('],
    ['запрещённая схема', '![Опасно](javascript:alert(1))'],
    ['data URL', '![Данные](data:image/png;base64,AAAA)'],
  ])('оставляет Aa fallback: %s', (_caseName, body) => {
    const { container } = renderCard({ body });

    expect(container.querySelector('.article-card-preview')).toBeNull();
    expect(screen.getByText('Aa')).toBeInTheDocument();
  });

  it('не запрашивает preview из приватной статьи', () => {
    const { container } = renderCard({
      body: `![Скрытая схема](${firstImageUrl})`,
      visibility: 'private',
    });

    expect(container.querySelector('.article-card-preview')).toBeNull();
    expect(screen.getByText('Aa')).toBeInTheDocument();
  });

  it('возвращает Aa при ошибке картинки и сбрасывает ошибку при новом src', () => {
    const view = renderCard({ body: `![Первая схема](${firstImageUrl})` });
    fireEvent.error(screen.getByRole('img', { name: 'Первая схема' }));
    expect(screen.getByText('Aa')).toBeInTheDocument();

    view.rerender(
      <MemoryRouter>
        <ArticleCard article={{
          ...article,
          body: `![Вторая схема](${secondImageUrl})`,
        }} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('img', { name: 'Вторая схема' }))
      .toHaveAttribute('src', secondImageUrl);
  });

  it('чистая функция не изменяет body и возвращает только безопасное первое изображение', () => {
    const body = `![Опасно](https://example.test/image.jpg)\n\n![Вторая](${secondImageUrl})`;

    expect(firstArticleImage(body)).toBeNull();
    expect(body).toContain('https://example.test/image.jpg');
    expect(firstArticleImage('')).toBeNull();
    expect(firstArticleImage(null)).toBeNull();
  });
});
