import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  deleteKnowledgeArticle,
  getKnowledgeArticle,
} from '../../api/knowledge.js';
import useAuth from '../../auth/useAuth.js';
import SiteLayout from '../../components/SiteLayout.jsx';
import MarkdownContent from './MarkdownContent.jsx';

const initialState = { status: 'loading', article: null };

function formatDate(value) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));
}

export default function ArticlePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { status: authStatus } = useAuth();
  const [state, setState] = useState(initialState);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (authStatus === 'loading') return undefined;

    let isActive = true;
    setState(initialState);

    // Авторизованный detail нужен для private-статей и backend can_edit.
    getKnowledgeArticle(id, authStatus === 'authenticated')
      .then((article) => {
        if (isActive) setState({ status: 'success', article });
      })
      .catch((error) => {
        if (!isActive) return;
        let status = 'error';
        if (error.status === 404) status = 'not-found';
        if (error.status === 403) status = 'forbidden';
        setState({
          status,
          article: null,
        });
      });

    return () => {
      isActive = false;
    };
  }, [authStatus, id]);

  async function handleDelete() {
    if (deletePending || !window.confirm('Удалить статью без возможности восстановления?')) {
      return;
    }

    setDeletePending(true);
    setDeleteError('');
    try {
      await deleteKnowledgeArticle(id);
      navigate('/knowledge?tab=articles', { replace: true });
    } catch {
      setDeleteError('Не удалось удалить статью. Попробуйте ещё раз.');
      setDeletePending(false);
    }
  }

  let content;
  if (authStatus === 'loading' || state.status === 'loading') {
    content = <div className="article-page-state" role="status">Загружаем статью…</div>;
  } else if (state.status === 'not-found') {
    content = (
      <div className="article-page-state" role="alert">
        <h1>Статья не найдена</h1>
        <p>Возможно, материал был удалён или адрес указан неверно.</p>
      </div>
    );
  } else if (state.status === 'forbidden') {
    content = (
      <div className="article-page-state" role="alert">
        <h1>Статья недоступна</h1>
        <p>Это приватный материал другого автора.</p>
      </div>
    );
  } else if (state.status === 'error') {
    content = (
      <div className="article-page-state" role="alert">
        <h1>Не удалось загрузить статью</h1>
        <p>Попробуйте открыть материал немного позже.</p>
      </div>
    );
  } else {
    const { article } = state;
    content = (
      <article className="article-reading-shell">
        <header className="article-reading-header">
          <div className="article-reading-meta">
            {article.author?.id ? (
              <Link to={`/knowledge/authors/${article.author.id}`}>
                {article.author.avatar_url && (
                  <img src={article.author.avatar_url} alt="" />
                )}
                {article.author.display_name}
              </Link>
            ) : (
              <span>{article.author?.display_name || 'Автор не указан'}</span>
            )}
            <time>{formatDate(article.created_at)}</time>
            {article.visibility === 'private' && <span>Приватная</span>}
          </div>
          <h1>{article.title}</h1>

          {article.can_edit === true && (
            <div className="article-owner-actions">
              <Link to={`/knowledge/articles/${article.id}/edit`}>Редактировать</Link>
              <button type="button" disabled={deletePending} onClick={handleDelete}>
                {deletePending ? 'Удаляем…' : 'Удалить статью'}
              </button>
            </div>
          )}
          {deleteError && (
            <p className="article-action-error" role="alert">{deleteError}</p>
          )}
        </header>
        <MarkdownContent authenticatedImages={article.visibility === 'private'}>
          {article.body}
        </MarkdownContent>
      </article>
    );
  }

  return (
    <SiteLayout>
      <div className="knowledge-page article-page">
        <div className="container article-page-content">
          <Link className="public-author-back" to="/knowledge?tab=articles">
            ← Все статьи
          </Link>
          {content}
        </div>
      </div>
    </SiteLayout>
  );
}
