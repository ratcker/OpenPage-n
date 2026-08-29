import { useState } from 'react';

const initialProfile = {
  name: 'Автор OpenPage',
  description: 'Здесь появится короткий рассказ о вас и ваших материалах.',
  avatar: 'OP',
};

function ProfileDialog({ profile, onClose, onSave }) {
  const [draft, setDraft] = useState(profile);

  function handleChange(event) {
    const { name, value } = event.target;
    setDraft((current) => ({ ...current, [name]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSave({
      name: draft.name.trim() || initialProfile.name,
      description: draft.description.trim() || initialProfile.description,
      avatar: draft.avatar.trim().slice(0, 2).toUpperCase() || initialProfile.avatar,
    });
  }

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <div className="profile-settings-backdrop" onMouseDown={handleBackdropClick}>
      <section
        className="profile-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-settings-title"
      >
        <div className="profile-settings-heading">
          <div>
            <p className="section-kicker">Автор материалов</p>
            <h2 id="profile-settings-title">Настройка профиля</h2>
          </div>
          <button className="dialog-close" type="button" aria-label="Закрыть" onClick={onClose}>×</button>
        </div>

        <form className="profile-settings-form" onSubmit={handleSubmit}>
          <div className="avatar-setting">
            <span className="author-avatar" aria-hidden="true">{draft.avatar || 'OP'}</span>
            <label>
              <span>Инициалы для аватара</span>
              <input
                name="avatar"
                value={draft.avatar}
                maxLength={2}
                placeholder="OP"
                onChange={handleChange}
              />
            </label>
          </div>

          <label>
            <span>Имя</span>
            <input name="name" value={draft.name} onChange={handleChange} required />
          </label>

          <label>
            <span>Описание</span>
            <textarea name="description" rows={4} value={draft.description} onChange={handleChange} />
          </label>

          <div className="profile-settings-actions">
            <button className="secondary-button" type="button" onClick={onClose}>Отмена</button>
            <button className="primary-button" type="submit">Сохранить</button>
          </div>
        </form>
      </section>
    </div>
  );
}

// Локальный авторский профиль для будущих материалов пользователя.
export default function AuthorProfile() {
  const [profile, setProfile] = useState(initialProfile);
  const [isEditing, setIsEditing] = useState(false);

  function handleSave(nextProfile) {
    setProfile(nextProfile);
    setIsEditing(false);
  }

  return (
    <>
      <section className="author-profile" aria-labelledby="author-profile-title">
        <span className="author-avatar" aria-hidden="true">{profile.avatar}</span>
        <div className="author-profile-copy">
          <p className="section-kicker">Ваш профиль автора</p>
          <h2 id="author-profile-title">{profile.name}</h2>
          <p>{profile.description}</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => setIsEditing(true)}>
          Настроить профиль
        </button>
      </section>

      {isEditing && (
        <ProfileDialog
          profile={profile}
          onClose={() => setIsEditing(false)}
          onSave={handleSave}
        />
      )}
    </>
  );
}
