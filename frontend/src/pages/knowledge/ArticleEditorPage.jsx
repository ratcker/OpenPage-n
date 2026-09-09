import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  createArticleUploadSession,
  createKnowledgeArticle,
  getKnowledgeArticle,
  getKnowledgeProfile,
  updateKnowledgeArticle,
  uploadArticleSessionImage,
} from '../../api/knowledge.js';
import SiteLayout from '../../components/SiteLayout.jsx';
import MarkdownContent from './MarkdownContent.jsx';

const emptyForm = {
  title: '',
  body: '',
  visibility: 'private',
};

function submitErrorMessage(error) {
  if (error.status === 400) return error.message;
  if (error.status === 403) return 'Сохранение доступно только автору статьи.';
  return 'Не удалось сохранить статью. Текст остался в редакторе.';
}

export default function ArticleEditorPage({ mode }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [profileStatus, setProfileStatus] = useState('loading');
  const [articleStatus, setArticleStatus] = useState(
    mode === 'edit' ? 'loading' : 'ready',
  );
  const [form, setForm] = useState(emptyForm);
  const [view, setView] = useState('edit');
  const [submitPending, setSubmitPending] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [imagePending, setImagePending] = useState(false);
  const [imageError, setImageError] = useState('');

  useEffect(() => {
    let isActive = true;
    setProfileStatus('loading');

    getKnowledgeProfile()
      .then(() => {
        if (isActive) setProfileStatus('ready');
      })
      .catch((error) => {
        if (!isActive) return;
        setProfileStatus(error.status === 404 ? 'missing' : 'error');
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (mode !== 'edit') return undefined;

    let isActive = true;
    setArticleStatus('loading');

    getKnowledgeArticle(id, true)
      .then((article) => {
        if (!isActive) return;
        if (article.can_edit !== true) {
          setArticleStatus('forbidden');
          return;
        }
        setForm({
          title: article.title,
          body: article.body,
          visibility: article.visibility,
        });
        setArticleStatus('ready');
      })
      .catch((error) => {
        if (!isActive) return;
        let status = 'error';
        if (error.status === 404) status = 'not-found';
        if (error.status === 403) status = 'forbidden';
        setArticleStatus(status);
      });

    return () => {
      isActive = false;
    };
  }, [id, mode]);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function insertImage(url, filename) {
    const alt = filename.replace(/\.[^.]+$/, '') || 'Изображение';
    const markdown = `![${alt}](${url})`;
    setForm((current) => ({
      ...current,
      body: `${current.body}${current.body ? '\n\n' : ''}${markdown}`,
    }));
  }

  async function handleImageChange(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file || imagePending) return;

    if (file.size > 5 * 1024 * 1024) {
      setImageError('Изображение не должно превышать 5 МБ.');
      return;
    }

    setImagePending(true);
    setImageError('');
    try {
      let uploadSessionId = sessionId;
      if (!uploadSessionId) {
        const uploadSession = await createArticleUploadSession();
        uploadSessionId = uploadSession.id;
        setSessionId(uploadSessionId);
      }
      const image = await uploadArticleSessionImage(uploadSessionId, file);
      insertImage(image.url, file.name);
    } catch (error) {
      setImageError(
        error.status === 400
          ? error.message
          : 'Не удалось загрузить изображение. Текст статьи не изменён.',
      );
    } finally {
      setImagePending(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitPending || imagePending) return;

    setSubmitPending(true);
    setSubmitError('');
    const data = { ...form };
    if (sessionId) data.upload_session_id = sessionId;

    try {
      const article = mode === 'edit'
        ? await updateKnowledgeArticle(id, data)
        : await createKnowledgeArticle(data);
      navigate(`/knowledge/articles/${article.id}`, { replace: true });
    } catch (error) {
      setSubmitError(submitErrorMessage(error));
      setSubmitPending(false);
    }
  }

  const isLoading = profileStatus === 'loading' || articleStatus === 'loading';
  let content;

  if (isLoading) {
    content = <div className="article-page-state" role="status">Готовим редактор…</div>;
  } else if (profileStatus === 'missing') {
    content = (
      <div className="article-page-state" role="alert">
        <h1>Нужен профиль автора</h1>
        <p>Создайте его в Базе знаний, чтобы публиковать материалы.</p>
        <Link className="knowledge-login-link" to="/knowledge">Перейти к профилю</Link>
      </div>
    );
  } else if (profileStatus === 'error') {
    content = (
      <div className="article-page-state" role="alert">
        <h1>Не удалось проверить профиль</h1>
        <p>Попробуйте открыть редактор немного позже.</p>
      </div>
    );
  } else if (articleStatus !== 'ready') {
    let title = 'Редактирование недоступно';
    let description = 'Изменять материал может только его автор.';
    if (articleStatus === 'not-found') {
      title = 'Статья не найдена';
      description = 'Возможно, материал был удалён.';
    } else if (articleStatus === 'error') {
      title = 'Не удалось загрузить статью';
      description = 'Попробуйте открыть редактор немного позже.';
    }

    content = (
      <div className="article-page-state" role="alert">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    );
  } else {
    content = (
      <form className="article-editor" onSubmit={handleSubmit}>
        <header className="article-editor-heading">
          <div>
            <p className="section-kicker">
              {mode === 'edit' ? 'Редактирование' : 'Новый материал'}
            </p>
            <h1>{mode === 'edit' ? 'Редактировать статью' : 'Написать статью'}</h1>
          </div>
          <label>
            <span>Видимость</span>
            <select
              name="visibility"
              value={form.visibility}
              disabled={submitPending}
              onChange={handleChange}
            >
              <option value="private">Приватная</option>
              <option value="public">Публичная</option>
            </select>
          </label>
        </header>

        <label className="article-title-field">
          <span>Название</span>
          <input
            name="title"
            value={form.title}
            maxLength="255"
            required
            disabled={submitPending}
            onChange={handleChange}
          />
        </label>

        <div className="article-editor-tabs" role="tablist" aria-label="Режим редактора">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'edit'}
            onClick={() => setView('edit')}
          >
            Редактирование
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'preview'}
            onClick={() => setView('preview')}
          >
            Предпросмотр
          </button>
        </div>

        {view === 'edit' ? (
          <div className="article-editor-body">
            <label>
              <span>Текст в Markdown</span>
              <textarea
                name="body"
                value={form.body}
                rows="22"
                required
                disabled={submitPending}
                onChange={handleChange}
              />
            </label>
            <div className="article-image-control">
              <label className={imagePending ? 'is-disabled' : ''}>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  disabled={imagePending || submitPending}
                  onChange={handleImageChange}
                />
                {imagePending ? 'Загружаем изображение…' : 'Добавить изображение'}
              </label>
              <span>JPEG, PNG, GIF или WebP до 5 МБ</span>
            </div>
            {imageError && (
              <p className="article-action-error" role="alert">{imageError}</p>
            )}
          </div>
        ) : (
          <div className="article-editor-preview">
            {form.body ? (
              <MarkdownContent authenticatedImages>{form.body}</MarkdownContent>
            ) : (
              <p>Предпросмотр появится после начала работы над текстом.</p>
            )}
          </div>
        )}

        {submitError && (
          <p className="article-action-error" role="alert">{submitError}</p>
        )}

        <div className="article-editor-actions">
          <Link to={mode === 'edit' ? `/knowledge/articles/${id}` : '/knowledge?tab=articles'}>
            Отмена
          </Link>
          <button
            className="primary-button"
            type="submit"
            disabled={submitPending || imagePending}
          >
            {submitPending ? 'Сохраняем…' : 'Сохранить статью'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <SiteLayout>
      <div className="knowledge-page article-editor-page">
        <div className="container article-editor-content">
          <Link className="public-author-back" to="/knowledge?tab=articles">
            ← Все статьи
          </Link>
          {content}
        </div>
      </div>
    </SiteLayout>
  );
}
