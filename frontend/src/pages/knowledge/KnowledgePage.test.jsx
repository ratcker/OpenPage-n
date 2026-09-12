import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearSession, saveSession } from '../../api/client.js';
import { AuthContext } from '../../auth/useAuth.js';
import { jsonResponse, mockUser } from '../../test/testData.js';
import KnowledgePage from './KnowledgePage.jsx';

const emptyPage = {
  count: 0,
  next: null,
  previous: null,
  results: [],
};

const publicBook = {
  id: '7da55fa2-b522-4c4c-95fe-18d1c8111480',
  title: 'Публичная книга из API',
  author: 'Автор каталога',
  description: 'Описание публичной книги.',
  language: 'ru',
  year: 2024,
  publisher: 'Опенпейч Пресс',
  cover_url: 'https://storage.example.test/public-cover.jpg',
  can_edit: false,
  format: 'epub',
  visibility: 'public',
  status: 'ready',
  created_at: '2026-08-30T12:00:00Z',
  updated_at: '2026-08-30T12:00:00Z',
};

const libraryBook = {
  ...publicBook,
  id: '584faf3f-e601-4c31-b078-7cc174a63457',
  title: 'Книга из личной библиотеки',
  author: 'Автор библиотеки',
  format: 'pdf',
  visibility: 'private',
  language: 'en',
  year: 2022,
  publisher: 'Library Press',
  cover_url: null,
  can_edit: true,
};

const libraryItem = {
  id: 18,
  book: libraryBook,
  reading_location: { chapter: 'chapter-4' },
  reading_percentage: '37.50',
  added_at: '2026-08-30T13:00:00Z',
  updated_at: '2026-08-30T13:00:00Z',
};

const profile = {
  id: '9a7c27e5-c9d4-428f-bc28-7ebaf83088cf',
  display_name: 'Анна Кузнецова',
  bio: 'Собираю материалы о дизайне и разработке.',
  avatar_url: 'https://storage.example.test/avatar.png',
};

const publicArticle = {
  id: 'eb56e24a-6c4c-4dbf-903c-768df56e1ed4',
  title: 'Статья из API',
  body: '# Полный заголовок\n\nКороткий **фрагмент** статьи.',
  visibility: 'public',
  author: profile,
  can_edit: false,
  created_at: '2026-09-08T12:00:00Z',
  updated_at: '2026-09-08T12:00:00Z',
};

function deferred() {
  let resolve;
  const promise = new Promise((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function page(results) {
  return {
    count: results.length,
    next: null,
    previous: null,
    results,
  };
}

function mockKnowledgeApi(overrides = {}, withSession = true) {
  const handlers = {
    '/api/knowledge/books/': () => Promise.resolve(jsonResponse(page([publicBook]))),
    '/api/knowledge/library/': () => Promise.resolve(jsonResponse(page([libraryItem]))),
    '/api/knowledge/profile/': () => Promise.resolve(jsonResponse(profile)),
    '/api/knowledge/articles/': () => Promise.resolve(jsonResponse(emptyPage)),
    '/api/knowledge/articles/mine/': () => Promise.resolve(jsonResponse(emptyPage)),
    ...overrides,
  };
  const fetchMock = vi.fn((url, options) => {
    const handler = handlers[url];
    if (!handler) throw new Error(`Неожиданный запрос: ${url}`);
    return handler(options);
  });

  vi.stubGlobal('fetch', fetchMock);
  if (withSession) saveSession({ access: 'knowledge-token', user: mockUser });
  return fetchMock;
}

function renderPage(authStatus = 'authenticated') {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={{
        status: authStatus,
        user: authStatus === 'authenticated' ? mockUser : null,
      }}>
        <KnowledgePage />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

async function fillUploadForm(browser, changes = {}) {
  const values = {
    file: new File(['book-content'], 'book.epub', { type: 'application/epub+zip' }),
    title: 'Новая книга',
    author: 'Новый автор',
    description: 'Новое описание',
    format: 'epub',
    visibility: 'private',
    language: 'de',
    year: '2021',
    publisher: 'Новое издательство',
    ...changes,
  };

  await browser.upload(screen.getByLabelText('Файл'), values.file);
  await browser.type(screen.getByLabelText('Название'), values.title);
  await browser.type(screen.getByLabelText('Автор'), values.author);
  await browser.type(screen.getByLabelText('Описание'), values.description);
  await browser.type(screen.getByLabelText('Язык'), values.language);
  await browser.type(screen.getByLabelText('Год'), values.year);
  await browser.type(screen.getByLabelText('Издательство'), values.publisher);
  await browser.selectOptions(screen.getByLabelText('Формат'), values.format);
  await browser.selectOptions(screen.getByLabelText('Видимость'), values.visibility);
  return values;
}

afterEach(() => {
  cleanup();
  clearSession();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('KnowledgePage', () => {
  it('показывает edit для own public-книги каталога только по can_edit', async () => {
    const ownPublicBook = {
      ...publicBook,
      id: '0419adef-86ac-42b6-8d85-0437dad1af85',
      title: 'Собственная публичная книга',
      can_edit: true,
    };
    mockKnowledgeApi({
      '/api/knowledge/books/': () => Promise.resolve(
        jsonResponse(page([publicBook, ownPublicBook])),
      ),
    });
    const browser = userEvent.setup();
    renderPage();

    const ownCard = (await screen.findByRole('heading', {
      name: ownPublicBook.title,
    })).closest('article');
    const foreignCard = screen.getByRole('heading', {
      name: publicBook.title,
    }).closest('article');

    expect(within(ownCard).getByRole('button', { name: 'Редактировать' }))
      .toBeInTheDocument();
    expect(within(foreignCard).queryByRole('button', { name: 'Редактировать' }))
      .not.toBeInTheDocument();

    await browser.click(within(ownCard).getByRole('button', { name: 'Редактировать' }));
    expect(screen.getByRole('dialog', { name: 'Редактировать книгу' })).toBeInTheDocument();
  });

  it('использует item.book.can_edit в library без visibility-эвристики', async () => {
    const editablePublicBook = {
      ...publicBook,
      id: 'a9292673-4026-42b0-bf4c-9f47a5e818f3',
      title: 'Публичная книга владельца в библиотеке',
      can_edit: true,
    };
    const lockedPrivateBook = {
      ...libraryBook,
      id: '41383146-3f9f-4eaa-8a98-a0fc1a12187e',
      title: 'Недоступная приватная книга',
      can_edit: false,
    };
    mockKnowledgeApi({
      '/api/knowledge/library/': () => Promise.resolve(jsonResponse(page([
        { ...libraryItem, id: 31, book: editablePublicBook },
        { ...libraryItem, id: 32, book: lockedPrivateBook },
      ]))),
    });
    renderPage();

    const editableCard = (await screen.findByRole('heading', {
      name: editablePublicBook.title,
    })).closest('article');
    const lockedCard = screen.getByRole('heading', {
      name: lockedPrivateBook.title,
    }).closest('article');

    expect(within(editableCard).getByRole('button', { name: 'Редактировать' }))
      .toBeInTheDocument();
    expect(within(lockedCard).queryByRole('button', { name: 'Редактировать' }))
      .not.toBeInTheDocument();
    expect(within(lockedCard).getByRole('link', { name: 'Читать' })).toBeInTheDocument();
  });

  it('показывает реальные covers, fallback и enriched metadata в обеих коллекциях', async () => {
    mockKnowledgeApi();
    renderPage();

    const catalogCard = (await screen.findByRole('heading', {
      name: publicBook.title,
    })).closest('article');
    const libraryCard = screen.getByRole('heading', {
      name: libraryBook.title,
    }).closest('article');

    expect(within(catalogCard).getByRole('img', {
      name: `Обложка книги «${publicBook.title}»`,
    })).toHaveAttribute('src', publicBook.cover_url);
    expect(within(catalogCard).getByText('Автор каталога · 2024')).toBeInTheDocument();
    expect(within(catalogCard).getByText('Опенпейч Пресс')).toBeInTheDocument();
    expect(within(catalogCard).getByText('RU')).toBeInTheDocument();

    expect(within(libraryCard).getByRole('img', {
      name: `Обложка книги «${libraryBook.title}» отсутствует`,
    })).toBeInTheDocument();
    expect(within(libraryCard).getByText('Автор библиотеки · 2022')).toBeInTheDocument();
    expect(within(libraryCard).getByText('Library Press')).toBeInTheDocument();
    expect(within(libraryCard).getByText('EN')).toBeInTheDocument();
  });

  it('не рисует пустые optional metadata', async () => {
    const plainBook = {
      ...publicBook,
      language: '',
      year: null,
      publisher: '',
      cover_url: null,
    };
    mockKnowledgeApi({
      '/api/knowledge/books/': () => Promise.resolve(jsonResponse(page([plainBook]))),
    });
    renderPage();

    const card = (await screen.findByRole('heading', {
      name: plainBook.title,
    })).closest('article');
    expect(within(card).getByText(plainBook.author)).toBeInTheDocument();
    expect(card.querySelector('.book-metadata')).toBeNull();
    expect(card).not.toHaveTextContent('null');
    expect(card).not.toHaveTextContent('unknown');
  });

  it('запрашивает и показывает каталог, библиотеку, progress и профиль', async () => {
    const fetchMock = mockKnowledgeApi();

    renderPage();

    expect(await screen.findByRole('heading', { name: publicBook.title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: libraryBook.title })).toBeInTheDocument();
    expect(screen.getByText('37.50%')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: profile.display_name })).toBeInTheDocument();
    expect(screen.getByText(profile.bio)).toBeInTheDocument();
    expect(screen.getByRole('img', {
      name: `Аватар автора ${profile.display_name}`,
    })).toHaveAttribute('src', profile.avatar_url);
    expect(screen.getByRole('button', { name: 'Добавить в библиотеку' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Редактировать профиль' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Удалить аватар' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Открыть публичный профиль' }))
      .toHaveAttribute('href', `/knowledge/authors/${profile.id}`);
    expect(screen.getByRole('button', { name: 'Загрузить книгу' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Читать' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Читать' })[0]).toHaveAttribute(
      'href',
      `/knowledge/books/${libraryBook.id}/read`,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/knowledge/books/',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({ Authorization: 'Bearer knowledge-token' }),
      }),
    );

    for (const path of [
      '/api/knowledge/library/',
      '/api/knowledge/profile/',
    ]) {
      expect(fetchMock).toHaveBeenCalledWith(path, expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({ Authorization: 'Bearer knowledge-token' }),
      }));
    }
  });

  it('показывает anonymous пользователю только публичный каталог', async () => {
    const fetchMock = mockKnowledgeApi({}, false);

    renderPage('anonymous');

    expect(await screen.findByRole('heading', { name: publicBook.title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Публичный каталог' })).toBeInTheDocument();
    expect(screen.getByRole('heading', {
      name: 'Войдите, чтобы открыть личную библиотеку.',
    })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Войти' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Войти, чтобы добавить' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Читать' })).toHaveAttribute(
      'href',
      `/knowledge/books/${publicBook.id}/read`,
    );
    expect(screen.queryByRole('button', { name: 'Стать автором' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Добавить в библиотеку' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Загрузить книгу' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Редактировать' })).not.toBeInTheDocument();

    const requestedPaths = fetchMock.mock.calls.map(([path]) => path);
    expect(requestedPaths).toEqual(['/api/knowledge/books/']);
    expect(fetchMock.mock.calls[0][1].headers).toBeUndefined();
  });

  it('показывает статус книги, уже находящейся в библиотеке', async () => {
    const existingEntry = { ...libraryItem, id: 24, book: publicBook };
    mockKnowledgeApi({
      '/api/knowledge/library/': () => Promise.resolve(
        jsonResponse(page([existingEntry, libraryItem])),
      ),
    });

    renderPage();

    expect(await screen.findByRole('button', { name: 'В библиотеке' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Добавить в библиотеку' })).not.toBeInTheDocument();
  });

  it.each([200, 201])('считает add response %s успешным и обновляет библиотеку', async (responseStatus) => {
    const addedEntry = {
      ...libraryItem,
      id: 25,
      book: publicBook,
      reading_percentage: '0.00',
    };
    const addPath = `/api/knowledge/library/${publicBook.id}/`;
    const addHandler = vi.fn(() => Promise.resolve(jsonResponse(addedEntry, responseStatus)));
    const fetchMock = mockKnowledgeApi({ [addPath]: addHandler });
    const browser = userEvent.setup();
    renderPage();

    await browser.click(await screen.findByRole('button', { name: 'Добавить в библиотеку' }));

    expect(await screen.findByRole('button', { name: 'В библиотеке' })).toBeDisabled();
    const library = screen.getByRole('region', { name: 'Ваши книги' });
    expect(within(library).getByRole('heading', { name: publicBook.title })).toBeInTheDocument();
    expect(addHandler).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(addPath, expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer knowledge-token' }),
    }));
  });

  it('оставляет каталог рабочим при ошибке добавления', async () => {
    const addPath = `/api/knowledge/library/${publicBook.id}/`;
    mockKnowledgeApi({
      [addPath]: () => Promise.resolve(jsonResponse({ detail: 'Ошибка добавления' }, 500)),
    });
    const browser = userEvent.setup();
    renderPage();

    await browser.click(await screen.findByRole('button', { name: 'Добавить в библиотеку' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось добавить книгу. Попробуйте ещё раз.',
    );
    expect(screen.getByRole('heading', { name: publicBook.title })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Добавить в библиотеку' })).toBeEnabled();
  });

  it('показывает независимые loading states без изменения макета', () => {
    const pendingRequest = new Promise(() => {});
    mockKnowledgeApi({
      '/api/knowledge/books/': () => pendingRequest,
      '/api/knowledge/library/': () => pendingRequest,
      '/api/knowledge/profile/': () => pendingRequest,
    });

    renderPage();

    expect(screen.getByRole('status', { name: 'Загружаем публичные книги…' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Загружаем вашу библиотеку…' })).toBeInTheDocument();
    expect(screen.getByText('Загружаем профиль…')).toBeInTheDocument();
  });

  it('переключает страницы каталога и библиотеки независимо', async () => {
    const catalogSecondBook = {
      ...publicBook,
      id: '711965a3-d329-479e-9758-cf5b8f8d66db',
      title: 'Двадцать первая книга каталога',
    };
    const librarySecondBook = {
      ...libraryBook,
      id: 'f24d17cd-1575-4eb4-b613-b8aa2b3a45dc',
      title: 'Двадцать первая книга библиотеки',
    };
    const librarySecondItem = {
      ...libraryItem,
      id: 39,
      book: librarySecondBook,
    };
    const fetchMock = mockKnowledgeApi({
      '/api/knowledge/books/': () => Promise.resolve(jsonResponse({
        count: 21,
        next: '/api/knowledge/books/?page=2',
        previous: null,
        results: [publicBook],
      })),
      '/api/knowledge/books/?page=2': () => Promise.resolve(jsonResponse({
        count: 21,
        next: null,
        previous: '/api/knowledge/books/',
        results: [catalogSecondBook],
      })),
      '/api/knowledge/library/': () => Promise.resolve(jsonResponse({
        count: 21,
        next: '/api/knowledge/library/?page=2',
        previous: null,
        results: [libraryItem],
      })),
      '/api/knowledge/library/?page=2': () => Promise.resolve(jsonResponse({
        count: 21,
        next: null,
        previous: '/api/knowledge/library/',
        results: [librarySecondItem],
      })),
    });
    const browser = userEvent.setup();
    renderPage();

    const catalogPages = await screen.findByRole('navigation', {
      name: 'Страницы: Публичные книги',
    });
    const libraryPages = screen.getByRole('navigation', {
      name: 'Страницы: Ваши книги',
    });
    await browser.click(within(catalogPages).getByRole('button', { name: 'Далее' }));

    expect(await screen.findByRole('heading', {
      name: catalogSecondBook.title,
    })).toBeInTheDocument();
    expect(within(libraryPages).getByText('Страница 1')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: libraryBook.title })).toBeInTheDocument();

    await browser.click(within(libraryPages).getByRole('button', { name: 'Далее' }));

    expect(await screen.findByRole('heading', {
      name: librarySecondBook.title,
    })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: catalogSecondBook.title })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/knowledge/books/?page=2',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer knowledge-token' }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/knowledge/library/?page=2',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer knowledge-token' }),
      }),
    );
  });

  it('показывает отдельные empty states каталога и библиотеки', async () => {
    mockKnowledgeApi({
      '/api/knowledge/books/': () => Promise.resolve(jsonResponse(emptyPage)),
      '/api/knowledge/library/': () => Promise.resolve(jsonResponse(emptyPage)),
    });

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Публичных книг пока нет.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'В вашей библиотеке пока нет книг.' })).toBeInTheDocument();
  });

  it('не ломает библиотеку и профиль при ошибке каталога', async () => {
    mockKnowledgeApi({
      '/api/knowledge/books/': () => Promise.resolve(
        jsonResponse({ detail: 'Ошибка каталога' }, 500),
      ),
    });

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Не удалось загрузить каталог.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: libraryBook.title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: profile.display_name })).toBeInTheDocument();
  });

  it('не ломает каталог и профиль при ошибке библиотеки', async () => {
    mockKnowledgeApi({
      '/api/knowledge/library/': () => Promise.resolve(
        jsonResponse({ detail: 'Ошибка библиотеки' }, 500),
      ),
    });

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Не удалось загрузить библиотеку.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: publicBook.title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: profile.display_name })).toBeInTheDocument();
  });

  it('показывает upload form со всеми полями только автору', async () => {
    mockKnowledgeApi();
    const browser = userEvent.setup();
    renderPage();

    await browser.click(await screen.findByRole('button', { name: 'Загрузить книгу' }));

    expect(screen.getByRole('dialog', { name: 'Загрузить книгу' })).toBeInTheDocument();
    expect(screen.getByLabelText('Файл')).toHaveAttribute('type', 'file');
    expect(screen.getByLabelText('Название')).toBeInTheDocument();
    expect(screen.getByLabelText('Автор')).toBeInTheDocument();
    expect(screen.getByLabelText('Описание')).toBeInTheDocument();
    expect(screen.getByLabelText('Язык')).toBeInTheDocument();
    expect(screen.getByLabelText('Год')).toHaveAttribute('type', 'number');
    expect(screen.getByLabelText('Издательство')).toBeInTheDocument();
    expect(screen.getByLabelText('Обложка')).toHaveAttribute('type', 'file');
    expect(screen.getByLabelText('Формат')).toHaveValue('epub');
    expect(screen.getByLabelText('Видимость')).toHaveValue('private');
    expect(screen.getByText(
      /Приватная книга будет доступна только вам/,
    )).toBeInTheDocument();
    expect(screen.queryByText('Права на публикацию')).not.toBeInTheDocument();
  });

  it('требует основание и подтверждение для публичной книги', async () => {
    mockKnowledgeApi();
    const browser = userEvent.setup();
    renderPage();

    await browser.click(await screen.findByRole('button', { name: 'Загрузить книгу' }));
    await browser.selectOptions(screen.getByLabelText('Видимость'), 'public');

    const submit = screen.getByRole('button', { name: 'Загрузить' });
    expect(screen.getByText('Права на публикацию')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Я автор произведения/ }))
      .not.toBeChecked();
    expect(screen.getByRole('radio', { name: /Я распространяю произведение/ }))
      .not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Я подтверждаю достоверность/ }))
      .not.toBeChecked();
    expect(submit).toBeDisabled();

    await browser.click(screen.getByRole('radio', { name: /Я автор произведения/ }));
    expect(submit).toBeDisabled();
    await browser.click(screen.getByRole('checkbox', {
      name: /Я подтверждаю достоверность/,
    }));
    expect(submit).toBeEnabled();
  });

  it.each([
    ['Я автор произведения', 'author'],
    ['Я распространяю произведение', 'authorized_distributor'],
  ])('отправляет выбранное основание «%s»', async (label, basis) => {
    let uploadOptions;
    mockKnowledgeApi({
      '/api/knowledge/books/': (options) => {
        if (options.method === 'POST') {
          uploadOptions = options;
          return Promise.resolve(jsonResponse({ ...publicBook, publication_basis: basis }, 201));
        }
        return Promise.resolve(jsonResponse(page([publicBook])));
      },
    });
    const browser = userEvent.setup();
    renderPage();

    await browser.click(await screen.findByRole('button', { name: 'Загрузить книгу' }));
    await fillUploadForm(browser, {
      file: new File(['pdf'], 'book.pdf', { type: 'application/pdf' }),
      format: 'pdf',
      visibility: 'public',
    });
    await browser.click(screen.getByRole('radio', { name: new RegExp(label) }));
    await browser.click(screen.getByRole('checkbox', {
      name: /Я подтверждаю достоверность/,
    }));
    await browser.click(screen.getByRole('button', { name: 'Загрузить' }));

    await waitFor(() => expect(uploadOptions).toBeDefined());
    expect(uploadOptions.body.get('publication_basis')).toBe(basis);
    expect(uploadOptions.body.get('rights_confirmation')).toBe('true');
    expect(uploadOptions.body.get('rights_confirmed_at')).toBeNull();
    expect(uploadOptions.body.get('rights_statement_version')).toBeNull();
  });

  it('не отправляет права для приватной книги', async () => {
    let uploadOptions;
    mockKnowledgeApi({
      '/api/knowledge/books/': (options) => {
        if (options.method === 'POST') {
          uploadOptions = options;
          return Promise.resolve(jsonResponse({ ...libraryBook }, 201));
        }
        return Promise.resolve(jsonResponse(page([publicBook])));
      },
    });
    const browser = userEvent.setup();
    renderPage();

    await browser.click(await screen.findByRole('button', { name: 'Загрузить книгу' }));
    await fillUploadForm(browser, {
      file: new File(['pdf'], 'book.pdf', { type: 'application/pdf' }),
      format: 'pdf',
    });
    await browser.click(screen.getByRole('button', { name: 'Загрузить' }));

    await waitFor(() => expect(uploadOptions).toBeDefined());
    expect(uploadOptions.body.get('publication_basis')).toBeNull();
    expect(uploadOptions.body.get('rights_confirmation')).toBeNull();
  });

  it('извлекает EPUB metadata один раз и сохраняет последующий ручной ввод', async () => {
    const previewResponse = deferred();
    let previewOptions;
    mockKnowledgeApi({
      '/api/knowledge/books/preview/': (options) => {
        previewOptions = options;
        return previewResponse.promise;
      },
    });
    const browser = userEvent.setup();
    renderPage();

    await browser.click(await screen.findByRole('button', { name: 'Загрузить книгу' }));
    const file = new File(['epub-content'], 'metadata.epub', {
      type: 'application/epub+zip',
    });
    await browser.upload(screen.getByLabelText('Файл'), file);

    expect(screen.getByRole('status')).toHaveTextContent('Извлекаем данные…');
    expect(screen.getByRole('button', { name: 'Загрузить' })).toBeDisabled();
    expect(previewOptions.body).toBeInstanceOf(FormData);
    expect(previewOptions.body.get('file')).toEqual(file);
    expect(previewOptions.headers).not.toHaveProperty('Content-Type');

    previewResponse.resolve(jsonResponse({
      title: 'Название из EPUB',
      author: 'Автор из EPUB',
      language: 'ru',
      publisher: 'EPUB Press',
      year: 2024,
      cover: 'data:image/jpeg;base64,Y292ZXI=',
    }));

    expect(await screen.findByDisplayValue('Название из EPUB')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Автор из EPUB')).toBeInTheDocument();
    expect(screen.getByLabelText('Язык')).toHaveValue('ru');
    expect(screen.getByLabelText('Издательство')).toHaveValue('EPUB Press');
    expect(screen.getByLabelText('Год')).toHaveValue(2024);
    expect(screen.getByRole('img', { name: 'Предпросмотр обложки' })).toHaveAttribute(
      'src',
      'data:image/jpeg;base64,Y292ZXI=',
    );

    await browser.clear(screen.getByLabelText('Название'));
    await browser.type(screen.getByLabelText('Название'), 'Исправленное название');
    await browser.selectOptions(screen.getByLabelText('Видимость'), 'public');
    expect(screen.getByLabelText('Название')).toHaveValue('Исправленное название');
  });

  it('оставляет ручную загрузку доступной после preview error', async () => {
    const uploadedBook = { ...publicBook, title: 'Ручное название', visibility: 'private' };
    mockKnowledgeApi({
      '/api/knowledge/books/preview/': () => Promise.resolve(
        jsonResponse({ file: ['Повреждённый EPUB'] }, 400),
      ),
      '/api/knowledge/books/': (options) => (
        options.method === 'POST'
          ? Promise.resolve(jsonResponse(uploadedBook, 201))
          : Promise.resolve(jsonResponse(page([publicBook])))
      ),
    });
    const browser = userEvent.setup();
    renderPage();

    await browser.click(await screen.findByRole('button', { name: 'Загрузить книгу' }));
    await browser.upload(
      screen.getByLabelText('Файл'),
      new File(['broken'], 'broken.epub', { type: 'application/epub+zip' }),
    );
    expect(await screen.findByText(
      'Не удалось извлечь данные автоматически. Заполните поля вручную.',
    )).toBeInTheDocument();

    await browser.type(screen.getByLabelText('Название'), 'Ручное название');
    await browser.type(screen.getByLabelText('Автор'), 'Ручной автор');
    await browser.click(screen.getByRole('button', { name: 'Загрузить' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Загрузить книгу' })).not.toBeInTheDocument();
    });
  });

  it('не вызывает EPUB preview для PDF', async () => {
    const fetchMock = mockKnowledgeApi();
    const browser = userEvent.setup();
    renderPage();

    await browser.click(await screen.findByRole('button', { name: 'Загрузить книгу' }));
    await browser.upload(
      screen.getByLabelText('Файл'),
      new File(['pdf'], 'book.pdf', { type: 'application/pdf' }),
    );

    expect(screen.getByLabelText('Формат')).toHaveValue('pdf');
    expect(fetchMock.mock.calls.map(([path]) => path)).not.toContain(
      '/api/knowledge/books/preview/',
    );
  });

  it('показывает manual cover поверх EPUB preview и отправляет его в FormData', async () => {
    let uploadOptions;
    mockKnowledgeApi({
      '/api/knowledge/books/preview/': () => Promise.resolve(jsonResponse({
        title: 'EPUB title',
        author: 'EPUB author',
        language: null,
        publisher: null,
        year: null,
        cover: 'data:image/jpeg;base64,ZXB1Yg==',
      })),
      '/api/knowledge/books/': (options) => {
        if (options.method === 'POST') {
          uploadOptions = options;
          return Promise.resolve(jsonResponse({ ...publicBook, visibility: 'private' }, 201));
        }
        return Promise.resolve(jsonResponse(page([publicBook])));
      },
    });
    const browser = userEvent.setup();
    renderPage();

    await browser.click(await screen.findByRole('button', { name: 'Загрузить книгу' }));
    await browser.upload(
      screen.getByLabelText('Файл'),
      new File(['epub'], 'book.epub', { type: 'application/epub+zip' }),
    );
    await screen.findByDisplayValue('EPUB title');
    const cover = new File(['manual-cover'], 'cover.png', { type: 'image/png' });
    await browser.upload(screen.getByLabelText('Обложка'), cover);

    await waitFor(() => {
      expect(screen.getByText('Выбранная обложка')).toBeInTheDocument();
      expect(screen.getByRole('img', { name: 'Предпросмотр обложки' }).src)
        .not.toContain('ZXB1Yg==');
    });
    await browser.click(screen.getByRole('button', { name: 'Загрузить' }));

    await waitFor(() => expect(uploadOptions).toBeDefined());
    expect(uploadOptions.body.get('cover')).toEqual(cover);
    expect(uploadOptions.body.get('language')).toBeNull();
    expect(uploadOptions.body.get('publisher')).toBeNull();
  });

  it('отправляет FormData и после public upload обновляет библиотеку и каталог', async () => {
    const uploadedBook = {
      ...publicBook,
      id: 'eb56e24a-6c4c-4dbf-903c-768df56e1ed4',
      title: 'Загруженная публичная книга',
      author: 'Новый автор',
      description: 'Новое описание',
      format: 'pdf',
      can_edit: true,
    };
    const uploadedEntry = {
      ...libraryItem,
      id: 26,
      book: uploadedBook,
      reading_percentage: '0.00',
    };
    let booksReads = 0;
    let libraryReads = 0;
    let uploadOptions;
    mockKnowledgeApi({
      '/api/knowledge/books/': (options) => {
        if (options.method === 'POST') {
          uploadOptions = options;
          return Promise.resolve(jsonResponse(uploadedBook, 201));
        }
        booksReads += 1;
        const books = booksReads === 1
          ? [publicBook]
          : [uploadedBook, publicBook];
        return Promise.resolve(jsonResponse(page(books)));
      },
      '/api/knowledge/library/': () => {
        libraryReads += 1;
        const entries = libraryReads === 1
          ? [libraryItem]
          : [uploadedEntry, libraryItem];
        return Promise.resolve(jsonResponse(page(entries)));
      },
    });
    const browser = userEvent.setup();
    renderPage();

    await browser.click(await screen.findByRole('button', { name: 'Загрузить книгу' }));
    const values = await fillUploadForm(browser, {
      file: new File(['pdf-content'], 'book.pdf', { type: 'application/pdf' }),
      format: 'pdf',
      visibility: 'public',
    });
    await browser.click(screen.getByRole('radio', { name: /Я автор произведения/ }));
    await browser.click(screen.getByRole('checkbox', {
      name: /Я подтверждаю достоверность/,
    }));
    expect(screen.getByLabelText('Файл').files).toHaveLength(1);
    await browser.click(screen.getByRole('button', { name: 'Загрузить' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Загрузить книгу' })).not.toBeInTheDocument();
    });
    expect(screen.getAllByRole('heading', { name: uploadedBook.title })).toHaveLength(2);
    for (const heading of screen.getAllByRole('heading', { name: uploadedBook.title })) {
      expect(within(heading.closest('article')).getByRole('button', {
        name: 'Редактировать',
      })).toBeInTheDocument();
    }
    expect(uploadOptions.body).toBeInstanceOf(FormData);
    expect(uploadOptions.headers).not.toHaveProperty('Content-Type');
    expect(uploadOptions.body.get('file')).toEqual(values.file);
    expect(uploadOptions.body.get('title')).toBe(values.title);
    expect(uploadOptions.body.get('author')).toBe(values.author);
    expect(uploadOptions.body.get('description')).toBe(values.description);
    expect(uploadOptions.body.get('format')).toBe('pdf');
    expect(uploadOptions.body.get('visibility')).toBe('public');
    expect(uploadOptions.body.get('publication_basis')).toBe('author');
    expect(uploadOptions.body.get('rights_confirmation')).toBe('true');
    expect(uploadOptions.body.get('language')).toBe(values.language);
    expect(uploadOptions.body.get('year')).toBe(values.year);
    expect(uploadOptions.body.get('publisher')).toBe(values.publisher);

    await browser.click(screen.getByRole('button', { name: 'Загрузить книгу' }));
    expect(screen.getByLabelText('Название')).toHaveValue('');
    expect(screen.getByLabelText('Автор')).toHaveValue('');
    expect(screen.getByLabelText('Описание')).toHaveValue('');
    expect(screen.getByLabelText('Язык')).toHaveValue('');
    expect(screen.getByLabelText('Год')).toHaveValue(null);
    expect(screen.getByLabelText('Издательство')).toHaveValue('');
    expect(screen.getByLabelText('Формат')).toHaveValue('epub');
    expect(screen.getByLabelText('Видимость')).toHaveValue('private');
    expect(screen.queryByText('Права на публикацию')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Файл').files).toHaveLength(0);
  });

  it('показывает publication badge только для подтверждённых оснований', async () => {
    const authorBook = {
      ...publicBook,
      id: '102de39a-2e75-4c91-991e-3ba77ad81527',
      title: 'Книга автора',
      publication_basis: 'author',
    };
    const distributorBook = {
      ...publicBook,
      id: '168cfaaf-adc4-4893-92d1-d5eb97dfc424',
      title: 'Книга распространителя',
      publication_basis: 'authorized_distributor',
    };
    mockKnowledgeApi({
      '/api/knowledge/books/': () => Promise.resolve(
        jsonResponse(page([authorBook, distributorBook, publicBook])),
      ),
    });
    renderPage();

    expect(await screen.findByText('От автора')).toBeInTheDocument();
    expect(screen.getByText('Опубликовано пользователем')).toBeInTheDocument();
    const legacyCard = screen.getByRole('heading', { name: publicBook.title })
      .closest('article');
    expect(within(legacyCard).queryByText('От автора')).not.toBeInTheDocument();
    expect(within(legacyCard).queryByText('Опубликовано пользователем'))
      .not.toBeInTheDocument();
  });

  it.each([
    [400, { title: ['Название обязательно.'] }, 'Название обязательно.'],
    [403, { detail: 'Профиль автора не найден.' }, 'Загрузка доступна только пользователям с профилем автора.'],
    [500, { detail: 'Ошибка сервера.' }, 'Не удалось загрузить книгу. Проверьте соединение и попробуйте ещё раз.'],
  ])('оставляет форму заполненной и показывает безопасную ошибку при %s', async (
    responseStatus,
    responseBody,
    expectedError,
  ) => {
    mockKnowledgeApi({
      '/api/knowledge/books/': (options) => {
        if (options.method === 'POST') {
          return Promise.resolve(jsonResponse(responseBody, responseStatus));
        }
        return Promise.resolve(jsonResponse(page([publicBook])));
      },
    });
    const browser = userEvent.setup();
    renderPage();

    await browser.click(await screen.findByRole('button', { name: 'Загрузить книгу' }));
    const values = await fillUploadForm(browser);
    await browser.click(screen.getByRole('button', { name: 'Загрузить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(expectedError);
    expect(screen.getByRole('dialog', { name: 'Загрузить книгу' })).toBeInTheDocument();
    expect(screen.getByLabelText('Название')).toHaveValue(values.title);
    expect(screen.getByLabelText('Автор')).toHaveValue(values.author);
    expect(screen.getByLabelText('Описание')).toHaveValue(values.description);
  });

  it('блокирует повторный submit, пока upload не завершён', async () => {
    const uploadResponse = deferred();
    const uploadHandler = vi.fn((options) => {
      if (options.method === 'POST') return uploadResponse.promise;
      return Promise.resolve(jsonResponse(page([publicBook])));
    });
    mockKnowledgeApi({ '/api/knowledge/books/': uploadHandler });
    const browser = userEvent.setup();
    renderPage();

    await browser.click(await screen.findByRole('button', { name: 'Загрузить книгу' }));
    await fillUploadForm(browser);
    await browser.click(screen.getByRole('button', { name: 'Загрузить' }));

    const pendingButton = screen.getByRole('button', { name: 'Загружаем…' });
    expect(pendingButton).toBeDisabled();
    await browser.click(pendingButton);
    expect(uploadHandler.mock.calls.filter(([options]) => options?.method === 'POST')).toHaveLength(1);

    uploadResponse.resolve(jsonResponse({ ...publicBook, visibility: 'private' }, 201));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Загрузить книгу' })).not.toBeInTheDocument();
    });
  });

  it('редактирует metadata собственной private-книги через multipart PATCH', async () => {
    const updatedBook = {
      ...libraryBook,
      title: 'Обновлённая книга',
      cover_url: 'https://storage.example.test/new-cover.png',
    };
    const updatedItem = { ...libraryItem, book: updatedBook };
    const patchPath = `/api/knowledge/books/${libraryBook.id}/`;
    let patchOptions;
    let libraryReads = 0;
    mockKnowledgeApi({
      [patchPath]: (options) => {
        patchOptions = options;
        return Promise.resolve(jsonResponse(updatedBook));
      },
      '/api/knowledge/library/': () => {
        libraryReads += 1;
        return Promise.resolve(jsonResponse(page([
          libraryReads === 1 ? libraryItem : updatedItem,
        ])));
      },
    });
    const browser = userEvent.setup();
    renderPage();

    expect(await screen.findAllByRole('button', { name: 'Редактировать' })).toHaveLength(1);
    await browser.click(screen.getByRole('button', { name: 'Редактировать' }));

    expect(screen.getByRole('dialog', { name: 'Редактировать книгу' })).toBeInTheDocument();
    expect(screen.getByLabelText('Название')).toHaveValue(libraryBook.title);
    expect(screen.getByLabelText('Автор')).toHaveValue(libraryBook.author);
    expect(screen.getByLabelText('Описание')).toHaveValue(libraryBook.description);
    expect(screen.getByLabelText('Язык')).toHaveValue(libraryBook.language);
    expect(screen.getByLabelText('Год')).toHaveValue(libraryBook.year);
    expect(screen.getByLabelText('Издательство')).toHaveValue(libraryBook.publisher);

    await browser.clear(screen.getByLabelText('Название'));
    await browser.type(screen.getByLabelText('Название'), updatedBook.title);
    const cover = new File(['new-cover'], 'new-cover.png', { type: 'image/png' });
    await browser.upload(screen.getByLabelText('Обложка'), cover);
    await browser.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('heading', { name: updatedBook.title })).toBeInTheDocument();
    const updatedCard = screen.getByRole('heading', {
      name: updatedBook.title,
    }).closest('article');
    expect(within(updatedCard).getByRole('button', { name: 'Редактировать' }))
      .toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Редактировать книгу' })).not.toBeInTheDocument();
    expect(patchOptions.method).toBe('PATCH');
    expect(patchOptions.body).toBeInstanceOf(FormData);
    expect(patchOptions.headers).not.toHaveProperty('Content-Type');
    expect(patchOptions.body.get('title')).toBe(updatedBook.title);
    expect(patchOptions.body.get('cover')).toEqual(cover);
    for (const field of ['visibility', 'format', 'status', 'storage_key', 'uploaded_by']) {
      expect(patchOptions.body.has(field)).toBe(false);
    }
  });

  it.each([
    [400, { year: ['Введите корректный год.'] }, 'Введите корректный год.'],
    [403, { detail: 'Нет доступа.' }, 'У вас нет доступа к редактированию этой книги.'],
  ])('сохраняет edit form и показывает понятную ошибку при %s', async (
    responseStatus,
    responseBody,
    expectedError,
  ) => {
    const patchPath = `/api/knowledge/books/${libraryBook.id}/`;
    mockKnowledgeApi({
      [patchPath]: () => Promise.resolve(jsonResponse(responseBody, responseStatus)),
    });
    const browser = userEvent.setup();
    renderPage();

    await browser.click(await screen.findByRole('button', { name: 'Редактировать' }));
    await browser.clear(screen.getByLabelText('Название'));
    await browser.type(screen.getByLabelText('Название'), 'Черновик изменений');
    await browser.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(expectedError);
    expect(screen.getByRole('dialog', { name: 'Редактировать книгу' })).toBeInTheDocument();
    expect(screen.getByLabelText('Название')).toHaveValue('Черновик изменений');
  });

  it('считает отсутствие профиля нормальным состоянием читателя', async () => {
    mockKnowledgeApi({
      '/api/knowledge/profile/': () => Promise.resolve(
        jsonResponse({ detail: 'Профиль не найден' }, 404),
      ),
    });

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Профиль автора не создан' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: publicBook.title })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Стать автором' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Загрузить книгу' })).not.toBeInTheDocument();
  });

  it('создаёт профиль через multipart и сразу включает author-state', async () => {
    const createdProfile = {
      ...profile,
      display_name: 'Новый автор',
      bio: 'Пишу о чтении.',
    };
    let createOptions;
    mockKnowledgeApi({
      '/api/knowledge/profile/': (options) => {
        if (options?.method === 'POST') {
          createOptions = options;
          return Promise.resolve(jsonResponse(createdProfile, 201));
        }
        return Promise.resolve(jsonResponse({ detail: 'Не найдено' }, 404));
      },
    });
    const browser = userEvent.setup();
    renderPage();

    await browser.click(await screen.findByRole('button', { name: 'Стать автором' }));
    expect(screen.getByRole('dialog', { name: 'Стать автором' })).toBeInTheDocument();
    expect(screen.getByLabelText('Отображаемое имя')).toBeRequired();
    expect(screen.getByLabelText('Описание')).toBeInTheDocument();
    expect(screen.getByLabelText('Аватар')).toHaveAttribute('type', 'file');

    await browser.type(screen.getByLabelText('Отображаемое имя'), createdProfile.display_name);
    await browser.type(screen.getByLabelText('Описание'), createdProfile.bio);
    const avatar = new File(['avatar'], 'avatar.png', { type: 'image/png' });
    await browser.upload(screen.getByLabelText('Аватар'), avatar);

    expect(await screen.findByRole('img', { name: 'Предпросмотр аватара' }))
      .toHaveAttribute('src', expect.stringMatching(/^data:image\/png;base64,/));
    expect(screen.queryByRole('button', { name: 'Удалить аватар' }))
      .not.toBeInTheDocument();
    await browser.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('heading', { name: createdProfile.display_name }))
      .toBeInTheDocument();
    expect(screen.getByText(createdProfile.bio)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Загрузить книгу' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Стать автором' })).not.toBeInTheDocument();
    expect(createOptions.method).toBe('POST');
    expect(createOptions.body).toBeInstanceOf(FormData);
    expect(createOptions.headers).not.toHaveProperty('Content-Type');
    expect(createOptions.body.get('display_name')).toBe(createdProfile.display_name);
    expect(createOptions.body.get('bio')).toBe(createdProfile.bio);
    expect(createOptions.body.get('avatar')).toEqual(avatar);
  });

  it('создаёт профиль без optional avatar', async () => {
    const createdProfile = {
      ...profile,
      display_name: 'Автор без аватара',
      bio: '',
      avatar_url: null,
    };
    let createOptions;
    mockKnowledgeApi({
      '/api/knowledge/profile/': (options) => {
        if (options?.method === 'POST') {
          createOptions = options;
          return Promise.resolve(jsonResponse(createdProfile, 201));
        }
        return Promise.resolve(jsonResponse({ detail: 'Не найдено' }, 404));
      },
    });
    const browser = userEvent.setup();
    renderPage();

    await browser.click(await screen.findByRole('button', { name: 'Стать автором' }));
    await browser.type(screen.getByLabelText('Отображаемое имя'), createdProfile.display_name);
    await browser.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('heading', { name: createdProfile.display_name }))
      .toBeInTheDocument();
    expect(screen.getByText('АБ')).toBeInTheDocument();
    expect(createOptions.body.get('bio')).toBe('');
    expect(createOptions.body.has('avatar')).toBe(false);
  });

  it('оставляет create dialog заполненным при validation и network errors', async () => {
    let submitCount = 0;
    mockKnowledgeApi({
      '/api/knowledge/profile/': (options) => {
        if (!options?.method) {
          return Promise.resolve(jsonResponse({ detail: 'Не найдено' }, 404));
        }
        submitCount += 1;
        if (submitCount === 1) {
          return Promise.resolve(jsonResponse({ display_name: ['Имя уже занято.'] }, 400));
        }
        return Promise.reject(new TypeError('Failed to fetch'));
      },
    });
    const browser = userEvent.setup();
    renderPage();

    await browser.click(await screen.findByRole('button', { name: 'Стать автором' }));
    await browser.type(screen.getByLabelText('Отображаемое имя'), 'Черновик автора');
    await browser.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Имя уже занято.');
    expect(screen.getByLabelText('Отображаемое имя')).toHaveValue('Черновик автора');

    await browser.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось сохранить профиль. Проверьте соединение и попробуйте ещё раз.',
    );
    expect(screen.getByLabelText('Отображаемое имя')).toHaveValue('Черновик автора');
  });

  it('после 409 повторно получает существующий профиль', async () => {
    let profileReads = 0;
    mockKnowledgeApi({
      '/api/knowledge/profile/': (options) => {
        if (options?.method === 'POST') {
          return Promise.resolve(jsonResponse({ detail: 'Профиль уже существует.' }, 409));
        }
        profileReads += 1;
        return Promise.resolve(profileReads === 1
          ? jsonResponse({ detail: 'Не найдено' }, 404)
          : jsonResponse(profile));
      },
    });
    const browser = userEvent.setup();
    renderPage();

    await browser.click(await screen.findByRole('button', { name: 'Стать автором' }));
    await browser.type(screen.getByLabelText('Отображаемое имя'), 'Конфликтующий профиль');
    await browser.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('heading', { name: profile.display_name }))
      .toBeInTheDocument();
    expect(profileReads).toBe(2);
    expect(screen.getByRole('button', { name: 'Загрузить книгу' })).toBeInTheDocument();
  });

  it('редактирует профиль, показывает новый avatar preview и обновляет карточку', async () => {
    const updatedProfile = {
      ...profile,
      display_name: 'Анна — редактор',
      bio: 'Обновлённое описание.',
      avatar_url: 'https://storage.example.test/new-avatar.png',
    };
    let patchOptions;
    mockKnowledgeApi({
      '/api/knowledge/profile/': (options) => {
        if (options?.method === 'PATCH') {
          patchOptions = options;
          return Promise.resolve(jsonResponse(updatedProfile));
        }
        return Promise.resolve(jsonResponse(profile));
      },
    });
    const browser = userEvent.setup();
    renderPage();

    await browser.click(await screen.findByRole('button', { name: 'Редактировать профиль' }));
    expect(screen.getByRole('dialog', { name: 'Редактировать профиль' }))
      .toBeInTheDocument();
    expect(screen.getByLabelText('Отображаемое имя')).toHaveValue(profile.display_name);
    expect(screen.getByLabelText('Описание')).toHaveValue(profile.bio);
    expect(screen.getByLabelText('Аватар')).toHaveValue('');
    expect(screen.getByRole('img', { name: 'Предпросмотр аватара' }))
      .toHaveAttribute('src', profile.avatar_url);

    await browser.clear(screen.getByLabelText('Отображаемое имя'));
    await browser.type(screen.getByLabelText('Отображаемое имя'), updatedProfile.display_name);
    await browser.clear(screen.getByLabelText('Описание'));
    await browser.type(screen.getByLabelText('Описание'), updatedProfile.bio);
    const avatar = new File(['new-avatar'], 'new-avatar.webp', { type: 'image/webp' });
    await browser.upload(screen.getByLabelText('Аватар'), avatar);
    expect(await screen.findByText('Новый аватар')).toBeInTheDocument();
    await browser.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('heading', { name: updatedProfile.display_name }))
      .toBeInTheDocument();
    expect(screen.getByText(updatedProfile.bio)).toBeInTheDocument();
    expect(patchOptions.method).toBe('PATCH');
    expect(patchOptions.body).toBeInstanceOf(FormData);
    expect(patchOptions.headers).not.toHaveProperty('Content-Type');
    expect(patchOptions.body.get('display_name')).toBe(updatedProfile.display_name);
    expect(patchOptions.body.get('bio')).toBe(updatedProfile.bio);
    expect(patchOptions.body.get('avatar')).toEqual(avatar);
  });

  it('оставляет edit dialog открытым при validation error', async () => {
    mockKnowledgeApi({
      '/api/knowledge/profile/': (options) => (
        options?.method === 'PATCH'
          ? Promise.resolve(jsonResponse({ display_name: ['Введите имя.'] }, 400))
          : Promise.resolve(jsonResponse(profile))
      ),
    });
    const browser = userEvent.setup();
    renderPage();

    await browser.click(await screen.findByRole('button', { name: 'Редактировать профиль' }));
    await browser.clear(screen.getByLabelText('Отображаемое имя'));
    await browser.type(screen.getByLabelText('Отображаемое имя'), 'Черновик');
    await browser.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Введите имя.');
    expect(screen.getByRole('dialog', { name: 'Редактировать профиль' }))
      .toBeInTheDocument();
    expect(screen.getByLabelText('Отображаемое имя')).toHaveValue('Черновик');
  });

  it('удаляет avatar и сразу показывает fallback', async () => {
    let deleteOptions;
    mockKnowledgeApi({
      '/api/knowledge/profile/avatar/': (options) => {
        deleteOptions = options;
        return Promise.resolve(jsonResponse({ ...profile, avatar_url: null }));
      },
    });
    const browser = userEvent.setup();
    renderPage();

    await screen.findByRole('button', { name: 'Редактировать профиль' });
    expect(screen.queryByRole('button', { name: 'Удалить аватар' }))
      .not.toBeInTheDocument();
    await browser.click(screen.getByRole('button', { name: 'Редактировать профиль' }));
    await browser.click(screen.getByRole('button', { name: 'Удалить аватар' }));

    expect(await screen.findByText('АК')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Удалить аватар' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Редактировать профиль' }))
      .toBeInTheDocument();
    expect(deleteOptions.method).toBe('DELETE');
    expect(deleteOptions.headers).toEqual(expect.objectContaining({
      Authorization: 'Bearer knowledge-token',
    }));
  });

  it('не ломает профиль при ошибке удаления avatar', async () => {
    mockKnowledgeApi({
      '/api/knowledge/profile/avatar/': () => Promise.resolve(
        jsonResponse({ detail: 'Storage error' }, 500),
      ),
    });
    const browser = userEvent.setup();
    renderPage();

    await browser.click(await screen.findByRole('button', { name: 'Редактировать профиль' }));
    await browser.click(screen.getByRole('button', { name: 'Удалить аватар' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось удалить аватар. Попробуйте ещё раз.',
    );
    expect(screen.getByRole('img', {
      name: `Аватар автора ${profile.display_name}`,
    })).toHaveAttribute('src', profile.avatar_url);
    expect(screen.getByRole('button', { name: 'Удалить аватар' })).toBeEnabled();
  });

  it('отличает серверную ошибку профиля от missing state', async () => {
    mockKnowledgeApi({
      '/api/knowledge/profile/': () => Promise.resolve(
        jsonResponse({ detail: 'Ошибка профиля' }, 503),
      ),
    });

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Не удалось загрузить профиль.' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Профиль автора не создан')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: publicBook.title })).toBeInTheDocument();
  });

  it('загружает public articles и переключает их страницы независимо от книг', async () => {
    const secondArticle = {
      ...publicArticle,
      id: '2472e136-d016-472a-95bc-0e0bff970cc7',
      title: 'Вторая страница статей',
    };
    const firstPath = '/api/knowledge/articles/';
    const secondPath = '/api/knowledge/articles/?page=2';
    const fetchMock = mockKnowledgeApi({
      [firstPath]: () => Promise.resolve(jsonResponse({
        ...page([publicArticle]),
        count: 2,
        next: `https://example.test${secondPath}`,
      })),
      [secondPath]: () => Promise.resolve(jsonResponse({
        ...page([secondArticle]),
        count: 2,
        previous: `https://example.test${firstPath}`,
      })),
    });
    const browser = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: publicBook.title });
    await browser.click(screen.getByRole('tab', { name: 'Статьи' }));

    expect(await screen.findByRole('heading', { name: publicArticle.title })).toBeInTheDocument();
    expect(screen.getByText('Полный заголовок Короткий фрагмент статьи.'))
      .toBeInTheDocument();
    expect(screen.getByRole('link', { name: profile.display_name })).toHaveAttribute(
      'href',
      `/knowledge/authors/${profile.id}`,
    );
    expect(screen.getByRole('link', { name: `Читать «${publicArticle.title}»` }))
      .toHaveAttribute('href', `/knowledge/articles/${publicArticle.id}`);
    expect(screen.queryByRole('heading', { name: 'Ваши книги' })).not.toBeInTheDocument();
    const articlesCall = fetchMock.mock.calls.find(([path]) => path === firstPath);
    expect(articlesCall[1].headers).toBeUndefined();

    await browser.click(screen.getByRole('button', { name: 'Далее' }));
    expect(await screen.findByRole('heading', { name: secondArticle.title }))
      .toBeInTheDocument();
    expect(screen.getByText('Страница 2')).toBeInTheDocument();
  });

  it('показывает автору отдельный список своих public и private статей', async () => {
    const privateArticle = {
      ...publicArticle,
      id: 'c80147fc-d76c-462d-b35b-c11282565d64',
      title: 'Личный черновик',
      visibility: 'private',
      can_edit: true,
    };
    const fetchMock = mockKnowledgeApi({
      '/api/knowledge/articles/': () => Promise.resolve(
        jsonResponse(page([publicArticle])),
      ),
      '/api/knowledge/articles/mine/': () => Promise.resolve(
        jsonResponse(page([privateArticle])),
      ),
    });
    const browser = userEvent.setup();
    renderPage();

    await browser.click(await screen.findByRole('tab', { name: 'Статьи' }));

    const personal = await screen.findByRole('region', { name: 'Ваши статьи' });
    const catalog = screen.getByRole('region', { name: 'Все статьи' });
    expect(within(personal).getByRole('heading', { name: privateArticle.title }))
      .toBeInTheDocument();
    expect(within(personal).getByText('Приватная')).toBeInTheDocument();
    expect(within(catalog).queryByRole('heading', { name: privateArticle.title }))
      .not.toBeInTheDocument();
    expect(within(catalog).getByRole('heading', { name: publicArticle.title }))
      .toBeInTheDocument();

    const mineCall = fetchMock.mock.calls.find(
      ([path]) => path === '/api/knowledge/articles/mine/',
    );
    expect(mineCall[1].headers).toEqual(expect.objectContaining({
      Authorization: 'Bearer knowledge-token',
    }));
  });

  it('переключает страницы личных и публичных статей независимо', async () => {
    const secondMineArticle = {
      ...publicArticle,
      id: 'e55b9a7c-1941-43f7-9016-5333077d36bd',
      title: 'Вторая личная статья',
      can_edit: true,
    };
    const secondPublicArticle = {
      ...publicArticle,
      id: 'd68634e8-412b-4fc9-8073-89566e359041',
      title: 'Вторая публичная статья',
    };
    const publicSecondPage = vi.fn(() => Promise.resolve(
      jsonResponse({ ...page([secondPublicArticle]), previous: '/api/knowledge/articles/' }),
    ));
    const mineSecondPage = vi.fn(() => Promise.resolve(jsonResponse({
      ...page([secondMineArticle]),
      previous: '/api/knowledge/articles/mine/',
    })));
    mockKnowledgeApi({
      '/api/knowledge/articles/': () => Promise.resolve(jsonResponse({
        ...page([publicArticle]),
        next: '/api/knowledge/articles/?page=2',
      })),
      '/api/knowledge/articles/?page=2': publicSecondPage,
      '/api/knowledge/articles/mine/': () => Promise.resolve(jsonResponse({
        ...page([{ ...publicArticle, can_edit: true }]),
        next: '/api/knowledge/articles/mine/?page=2',
      })),
      '/api/knowledge/articles/mine/?page=2': mineSecondPage,
    });
    const browser = userEvent.setup();
    renderPage();

    await browser.click(await screen.findByRole('tab', { name: 'Статьи' }));
    const personal = await screen.findByRole('region', { name: 'Ваши статьи' });
    const catalog = screen.getByRole('region', { name: 'Все статьи' });

    await browser.click(within(personal).getByRole('button', { name: 'Далее' }));
    expect(await within(personal).findByRole('heading', {
      name: secondMineArticle.title,
    })).toBeInTheDocument();
    expect(within(catalog).getByRole('heading', { name: publicArticle.title }))
      .toBeInTheDocument();
    expect(publicSecondPage).not.toHaveBeenCalled();

    await browser.click(within(catalog).getByRole('button', { name: 'Далее' }));
    expect(await within(catalog).findByRole('heading', {
      name: secondPublicArticle.title,
    })).toBeInTheDocument();
    expect(mineSecondPage).toHaveBeenCalledTimes(1);
  });

  it('показывает независимые empty и error states личных статей', async () => {
    mockKnowledgeApi();
    const browser = userEvent.setup();
    const emptyPageView = renderPage();
    await browser.click(await screen.findByRole('tab', { name: 'Статьи' }));

    const personal = await screen.findByRole('region', { name: 'Ваши статьи' });
    expect(within(personal).getByRole('heading', { name: 'У вас пока нет статей.' }))
      .toBeInTheDocument();

    emptyPageView.unmount();
    mockKnowledgeApi({
      '/api/knowledge/articles/': () => Promise.resolve(
        jsonResponse(page([publicArticle])),
      ),
      '/api/knowledge/articles/mine/': () => Promise.resolve(
        jsonResponse({ detail: 'Ошибка' }, 500),
      ),
    });
    renderPage();
    await browser.click(await screen.findByRole('tab', { name: 'Статьи' }));

    expect(await screen.findByRole('heading', {
      name: 'Не удалось загрузить ваши статьи.',
    })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: publicArticle.title }))
      .toBeInTheDocument();
  });

  it('показывает создание статьи только при существующем KnowledgeProfile', async () => {
    mockKnowledgeApi();
    const browser = userEvent.setup();
    const authorPage = renderPage();
    await browser.click(await screen.findByRole('tab', { name: 'Статьи' }));

    expect(await screen.findByRole('link', { name: 'Написать статью' })).toHaveAttribute(
      'href',
      '/knowledge/articles/new',
    );

    authorPage.unmount();
    const readerFetchMock = mockKnowledgeApi({
      '/api/knowledge/profile/': () => Promise.resolve(
        jsonResponse({ detail: 'Не найдено' }, 404),
      ),
    });
    renderPage();
    await browser.click(await screen.findByRole('tab', { name: 'Статьи' }));
    await screen.findByRole('heading', { name: 'Публичных статей пока нет.' });
    expect(screen.queryByRole('link', { name: 'Написать статью' })).not.toBeInTheDocument();
    const paths = readerFetchMock.mock.calls.map(([path]) => path);
    expect(paths).not.toContain('/api/knowledge/articles/mine/');
  });

  it('анонимно загружает public articles без profile/library и create action', async () => {
    const articlesHandler = vi.fn(() => Promise.resolve(
      jsonResponse(page([publicArticle])),
    ));
    const fetchMock = mockKnowledgeApi({
      '/api/knowledge/articles/': articlesHandler,
    }, false);
    const browser = userEvent.setup();
    renderPage('anonymous');

    await browser.click(await screen.findByRole('tab', { name: 'Статьи' }));

    expect(await screen.findByRole('heading', { name: publicArticle.title })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Написать статью' })).not.toBeInTheDocument();
    expect(articlesHandler).toHaveBeenCalledTimes(1);
    const paths = fetchMock.mock.calls.map(([path]) => path);
    expect(paths).not.toContain('/api/knowledge/profile/');
    expect(paths).not.toContain('/api/knowledge/library/');
    expect(paths).not.toContain('/api/knowledge/articles/mine/');
  });

  it('показывает articles error, не ломая переключатель разделов', async () => {
    mockKnowledgeApi({
      '/api/knowledge/articles/': () => Promise.resolve(
        jsonResponse({ detail: 'Ошибка статей' }, 500),
      ),
    });
    const browser = userEvent.setup();
    renderPage();

    await browser.click(await screen.findByRole('tab', { name: 'Статьи' }));

    expect(await screen.findByRole('heading', { name: 'Не удалось загрузить статьи.' }))
      .toBeInTheDocument();
    await browser.click(screen.getByRole('tab', { name: 'Книги' }));
    expect(screen.getByRole('heading', { name: publicBook.title })).toBeInTheDocument();
  });
});
