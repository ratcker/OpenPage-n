import { useState } from 'react';
import { Link } from 'react-router-dom';

const markdownImagePattern = /!\[([^\]\r\n]*)\]\(\s*([^\s)]+)(?:\s+(?:"[^"\r\n]*"|'[^'\r\n]*'))?\s*\)/;
const articleImagePathPattern = /^\/api\/knowledge\/article-images\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/$/i;

export function firstArticleImage(body) {
  if (typeof body !== 'string' || !body) return null;
  const match = markdownImagePattern.exec(body);
  if (!match || !articleImagePathPattern.test(match[2])) return null;
  return { src: match[2], alt: match[1].trim() };
}

function articleExcerpt(body) {
  const text = body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text.length > 170 ? `${text.slice(0, 167).trim()}…` : text;
}

function formatArticleDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));
}

function ArticleCardMark({ article }) {
  const preview = article.visibility === 'public'
    ? firstArticleImage(article.body)
    : null;
  const [failedSrc, setFailedSrc] = useState('');
  const showPreview = preview && failedSrc !== preview.src;

  return (
    <div className="article-card-mark" aria-hidden={showPreview ? undefined : 'true'}>
      {showPreview ? (
        <img
          className="article-card-preview"
          src={preview.src}
          alt={preview.alt || `Иллюстрация к статье «${article.title}»`}
          loading="lazy"
          onError={() => setFailedSrc(preview.src)}
        />
      ) : 'Aa'}
    </div>
  );
}

export default function ArticleCard({ article }) {
  const author = article.author;
  const excerpt = articleExcerpt(article.body || '');
  const articleUrl = `/knowledge/articles/${article.id}`;

  return (
    <article className="article-card">
      <ArticleCardMark article={article} />
      <div className="article-card-copy">
        <div className="article-card-meta">
          {author?.id ? (
            <Link to={`/knowledge/authors/${author.id}`}>
              {author.avatar_url && (
                <img src={author.avatar_url} alt="" loading="lazy" />
              )}
              {author.display_name}
            </Link>
          ) : (
            <span>{author?.display_name || 'Автор не указан'}</span>
          )}
          {article.created_at && <time>{formatArticleDate(article.created_at)}</time>}
          {article.visibility === 'private' && (
            <span className="article-visibility">Приватная</span>
          )}
        </div>
        <h3><Link to={articleUrl}>{article.title}</Link></h3>
        {excerpt && <p className="article-card-excerpt">{excerpt}</p>}
      </div>
      <Link className="article-card-open" to={articleUrl} aria-label={`Читать «${article.title}»`}>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="m7 4 6 6-6 6" />
        </svg>
      </Link>
    </article>
  );
}
