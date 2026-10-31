# Карта переноса CSS для OpenPage-n

Файлы расположены по структуре публичного репозитория `ratcker/OpenPage-n`, ветка `main`. Карта относится к подготовленным CSS-файлам; импорты в JSX не добавлялись.

## Общие стили

| Новый файл | Назначение |
|---|---|
| `frontend/src/styles/shared/theme.css` | CSS-переменные и палитра `:root` |
| `frontend/src/styles/shared/base.css` | Базовые стили `*`, `html`, `body`, `button`, `a` |
| `frontend/src/styles/shared/layout.css` | Общий каркас `.page`, `.container`, `.skip-link` |
| `frontend/src/styles/shared/utilities.css` | Утилиты вроде `.visually-hidden` и видимый фокус |
| `frontend/src/styles/shared/common-components.css` | Общие `.eyebrow`, `.primary-button`, `.section-kicker` и общая типографика карточек |
| `frontend/src/styles/shared/responsive.css` | Исходные адаптивные правила; импортируется в конце |
| `frontend/src/styles/shared/reduced-motion.css` | Правила `prefers-reduced-motion`; импортируется в самом конце |

Стили Markdown находятся рядом с соответствующим компонентом `pages/knowledge/MarkdownContent.jsx` в `frontend/src/pages/knowledge/MarkdownContent.css`.

## Каркас, главная страница и авторизация

| Новый файл | К какому коду относится |
|---|---|
| `frontend/src/components/Header.css` | `components/Header.jsx` |
| `frontend/src/components/Footer.css` | `components/Footer.jsx` |
| `frontend/src/pages/hub/HubPage.css` | Сохраняет исходный селектор `.landing` из монолита |
| `frontend/src/pages/hub/Hero.css` | `pages/hub/Hero.jsx` |
| `frontend/src/pages/hub/Services.css` | `pages/hub/Services.jsx` и карточки сервисов |
| `frontend/src/pages/LoginPage/LoginPage.css` | Страница входа/регистрации и форма авторизации |
| `frontend/src/pages/LoginPage/VerificationDialog.css` | `pages/LoginPage/VerificationDialog.jsx` |
| `frontend/src/auth/ProtectedRoute.css` | Состояние загрузки сессии из `auth/ProtectedRoute.jsx` |
| `frontend/src/pages/ProfilePage/ProfilePage.css` | `pages/ProfilePage/ProfilePage.jsx` |

## База знаний

| Новый файл | Назначение |
|---|---|
| `KnowledgePage.css` | Общий экран базы знаний, вкладки, каталоги, сетка статей и сообщения состояний |
| `AuthorProfile.css` | Карточка профиля автора в каталоге |
| `AuthorProfileDialog.css` | Предпросмотр аватара в диалоге профиля автора |
| `KnowledgeDialogs.css` | Общая кнопка закрытия диалогов |
| `BookUploadDialog.css` | Форма загрузки книги и общие поля диалога, часть которых переиспользуется в диалоге профиля автора |
| `BookDeleteDialog.css` | Правила подтверждения удаления книги |
| `BookCollection.css` | Сетка коллекции книг и загрузочные состояния списка |
| `BookCard.css` | Карточка книги и её обложка/метаданные |
| `BookLibraryAction.css` | Действия добавления книги в библиотеку |
| `BookPublicationInfo.css` | Метка и информационный блок публикации книги |
| `KnowledgeDetailPages.css` | Общий отступ содержимого страниц книги и личной библиотеки |
| `BookPage.css` | Страница книги, описание, метаданные, действия и ссылка на каталог при ошибке |
| `LibraryPage.css` | Заголовок личной библиотеки |
| `PublicAuthorPage.css` | Публичный профиль автора и список его публикаций |
| `KnowledgePagination.css` | Пагинация каталога, библиотеки и публичной страницы автора |
| `ReaderPage.css` | Интерфейс чтения PDF/EPUB и панель управления чтением |
| `MarkdownContent.css` | Стили отображения Markdown-контента |

## Статьи

| Новый файл | Назначение |
|---|---|
| `ArticleCard.css` | Карточка статьи |
| `ArticleLayout.css` | Общая ширина и вертикальные отступы экрана чтения/редактирования статьи |
| `ArticlePage.css` | Чтение статьи, заголовок, данные автора, состояния загрузки/ошибки |
| `ArticleActions.css` | Общие кнопки управления статьёй в просмотре и редакторе |
| `ArticleEditorPage.css` | Поля, переключение режима и предпросмотр редактора статьи |

## Точка входа и безопасное использование

`frontend/src/styles/index.css` импортирует подготовленные файлы, но специально не подключён в `main.jsx`. Текущий импорт `import './style.css';` должен оставаться без изменений, пока новая структура не пройдёт сборку и визуальную проверку. Не подключайте одновременно оба stylesheet-файла.

Исходный файл сохранён в `original/style.css`; он совпадает с переданным CSS побайтно. Некоторые правила намеренно остаются общими, потому что используются более чем одной страницей или компонентом. Селектор `.landing` сохранён даже несмотря на то, что текущий `RootPage.jsx` перенаправляет пользователя на `/hub`: это не повод удалять правило при первой раскладке CSS.
