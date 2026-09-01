function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'OP';
}

function avatarLabel(profile) {
  const avatar = profile.avatar.trim();
  return avatar && !avatar.includes('/')
    ? avatar.slice(0, 2).toUpperCase()
    : initials(profile.display_name);
}

export default function AuthorProfile({ state, onUpload }) {
  if (state.status === 'loading') {
    return (
      <section className="author-profile author-profile-loading" role="status">
        <span className="author-avatar" aria-hidden="true" />
        <div className="author-profile-copy">
          <p className="section-kicker">Ваш профиль</p>
          <h2>Загружаем профиль…</h2>
        </div>
      </section>
    );
  }

  if (state.status === 'anonymous') {
    return (
      <section className="author-profile" aria-labelledby="public-reader-title">
        <span className="author-avatar" aria-hidden="true">Ч</span>
        <div className="author-profile-copy">
          <p className="section-kicker">Режим читателя</p>
          <h2 id="public-reader-title">Публичный каталог</h2>
          <p>Для просмотра общедоступных книг вход не требуется.</p>
        </div>
        <button className="author-profile-button author-profile-button-primary" type="button">
          Создать профиль автора
        </button>
      </section>
    );
  }

  if (state.status === 'missing') {
    return (
      <section className="author-profile" aria-labelledby="reader-profile-title">
        <span className="author-avatar" aria-hidden="true">Ч</span>
        <div className="author-profile-copy">
          <p className="section-kicker">Профиль читателя</p>
          <h2 id="reader-profile-title">Профиль автора не создан</h2>
          <p>Библиотека и публичный каталог остаются доступны.</p>
        </div>
        <button className="author-profile-button author-profile-button-primary" type="button">
          Создать профиль автора
        </button>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section className="author-profile" role="alert">
        <span className="author-avatar" aria-hidden="true">OP</span>
        <div className="author-profile-copy">
          <p className="section-kicker">Ваш профиль</p>
          <h2>Не удалось загрузить профиль.</h2>
          <p>Остальные разделы продолжают работать.</p>
        </div>
      </section>
    );
  }

  const { profile } = state;

  return (
    <section className="author-profile" aria-labelledby="author-profile-title">
      <span className="author-avatar" aria-hidden="true">{avatarLabel(profile)}</span>
      <div className="author-profile-copy">
        <p className="section-kicker">Ваш профиль автора</p>
        <h2 id="author-profile-title">{profile.display_name}</h2>
        <p>{profile.bio}</p>
      </div>
      <div className="author-profile-actions">
        <button className="author-profile-button" type="button">
          Редактировать профиль
        </button>
        <button
          className="author-profile-button author-profile-button-primary"
          type="button"
          onClick={onUpload}
        >
          Загрузить книгу
        </button>
      </div>
    </section>
  );
}
