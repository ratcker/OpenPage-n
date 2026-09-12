import { useState } from 'react';

import {
  createKnowledgeProfile,
  deleteKnowledgeProfileAvatar,
  getKnowledgeProfile,
  updateKnowledgeProfile,
} from '../../api/knowledge.js';
import useImagePreview from './useImagePreview.js';

function formFromProfile(profile) {
  return {
    display_name: profile?.display_name || '',
    bio: profile?.bio || '',
    avatar: null,
  };
}

function profileErrorMessage(error) {
  if (error.status === 400) return error.message;
  return 'Не удалось сохранить профиль. Проверьте соединение и попробуйте ещё раз.';
}

export default function AuthorProfileDialog({
  mode,
  profile,
  onChanged,
  onClose,
  onSaved,
}) {
  const [form, setForm] = useState(() => formFromProfile(profile));
  const [isPending, setIsPending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [avatarInputVersion, setAvatarInputVersion] = useState(0);
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState(
    profile?.avatar_url || '',
  );
  const [error, setError] = useState('');
  const avatarPreview = useImagePreview(form.avatar);
  const isCreate = mode === 'create';

  function handleChange(event) {
    const { name, value, files } = event.target;
    setForm((current) => ({
      ...current,
      [name]: files ? files[0] || null : value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isPending || deletePending) return;

    const data = {};
    for (const field of ['display_name', 'bio']) {
      if (isCreate || form[field] !== (profile?.[field] || '')) {
        data[field] = form[field];
      }
    }
    if (form.avatar) data.avatar = form.avatar;
    if (!isCreate && Object.keys(data).length === 0) {
      onClose();
      return;
    }

    setIsPending(true);
    setError('');

    try {
      const savedProfile = isCreate
        ? await createKnowledgeProfile(data)
        : await updateKnowledgeProfile(data);
      onSaved(savedProfile);
    } catch (requestError) {
      if (isCreate && requestError.status === 409) {
        try {
          onSaved(await getKnowledgeProfile());
          return;
        } catch {
          setError('Профиль уже создан, но не удалось обновить его данные.');
        }
      } else {
        setError(profileErrorMessage(requestError));
      }
      setIsPending(false);
    }
  }

  async function handleRemoveAvatar() {
    if (form.avatar) {
      setForm((current) => ({ ...current, avatar: null }));
      setAvatarInputVersion((current) => current + 1);
      setError('');
      return;
    }
    if (!currentAvatarUrl || deletePending) return;

    setDeletePending(true);
    setError('');
    try {
      const updatedProfile = await deleteKnowledgeProfileAvatar();
      setCurrentAvatarUrl(updatedProfile.avatar_url || '');
      onChanged(updatedProfile);
    } catch {
      setError('Не удалось удалить аватар. Попробуйте ещё раз.');
    } finally {
      setDeletePending(false);
    }
  }

  function handleBackdropClick(event) {
    if (!isPending && !deletePending && event.target === event.currentTarget) onClose();
  }

  const preview = avatarPreview || currentAvatarUrl;
  const isBusy = isPending || deletePending;

  return (
    <div className="book-upload-backdrop" onMouseDown={handleBackdropClick}>
      <section
        className="book-upload-dialog author-profile-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="author-profile-dialog-title"
      >
        <div className="book-upload-heading">
          <div>
            <p className="section-kicker">Профиль автора</p>
            <h2 id="author-profile-dialog-title">
              {isCreate ? 'Стать автором' : 'Редактировать профиль'}
            </h2>
          </div>
          <button
            className="dialog-close"
            type="button"
            aria-label="Закрыть"
            disabled={isBusy}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <form className="book-upload-form" onSubmit={handleSubmit}>
          <label>
            <span>Отображаемое имя</span>
            <input
              name="display_name"
              value={form.display_name}
              maxLength={100}
              required
              disabled={isBusy}
              onChange={handleChange}
            />
          </label>

          <label>
            <span>Описание</span>
            <textarea
              name="bio"
              rows={4}
              value={form.bio}
              maxLength={2000}
              disabled={isBusy}
              onChange={handleChange}
            />
          </label>

          <label>
            <span>Аватар</span>
            <input
              name="avatar"
              type="file"
              key={avatarInputVersion}
              accept="image/jpeg,image/png,image/gif,image/webp"
              disabled={isBusy}
              onChange={handleChange}
            />
          </label>

          {preview && (
            <div className="author-avatar-preview">
              <div className="author-avatar-preview-image">
                <img src={preview} alt="Предпросмотр аватара" />
                {!isCreate && (
                  <button
                    type="button"
                    aria-label={form.avatar ? 'Отменить выбор аватара' : 'Удалить аватар'}
                    disabled={isBusy}
                    onClick={handleRemoveAvatar}
                  >
                    ×
                  </button>
                )}
              </div>
              <span>{form.avatar ? 'Новый аватар' : 'Текущий аватар'}</span>
            </div>
          )}

          {error && <p className="book-upload-error" role="alert">{error}</p>}

          <div className="book-upload-actions">
            <button type="button" disabled={isBusy} onClick={onClose}>
              Отмена
            </button>
            <button className="primary-button" type="submit" disabled={isBusy}>
              {isPending ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
