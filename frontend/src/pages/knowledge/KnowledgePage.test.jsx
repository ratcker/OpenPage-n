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
  id: 9,
  display_name: 'Анна Кузнецова',
  bio: 'Собираю материалы о дизайне и разработке.',
  avatar: 'АК',
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
    expect(screen.getByText('АК')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Добавить в библиотеку' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Редактировать профиль' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Загрузить книгу' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Читать' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Читать' })[0]).toHaveAttribute(
      'href',
      `/knowledge/books/${libraryBook.id}/read`,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/knowledge/books/',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(fetchMock.mock.calls.find(([path]) => (
      path === '/api/knowledge/books/'
    ))[1].headers).toBeUndefined();

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
    expect(screen.getByRole('button', { name: 'Создать профиль автора' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Добавить в библиотеку' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Загрузить книгу' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Редактировать' })).not.toBeInTheDocument();

    const requestedPaths = fetchMock.mock.calls.map(([path]) => path);
    expect(requestedPaths).toEqual(['/api/knowledge/books/']);
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
    expect(screen.getByLabelText('Файл').files).toHaveLength(0);
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
    expect(screen.getByRole('button', { name: 'Создать профиль автора' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Загрузить книгу' })).not.toBeInTheDocument();
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

  it('сохраняет локальное переключение на визуальный раздел статей', async () => {
    mockKnowledgeApi();
    const browser = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: publicBook.title });
    await browser.click(screen.getByRole('tab', { name: 'Статьи' }));

    expect(screen.getByRole('heading', { name: 'Статьи' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ваши книги' })).not.toBeInTheDocument();
  });
});
