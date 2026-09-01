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
    ...changes,
  };

  await browser.upload(screen.getByLabelText('Файл'), values.file);
  await browser.type(screen.getByLabelText('Название'), values.title);
  await browser.type(screen.getByLabelText('Автор'), values.author);
  await browser.type(screen.getByLabelText('Описание'), values.description);
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
    expect(screen.getByRole('button', { name: 'Загрузить книгу' })).toBeInTheDocument();

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
    expect(screen.queryByRole('button', { name: 'Добавить в библиотеку' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Загрузить книгу' })).not.toBeInTheDocument();

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
    expect(screen.getByLabelText('Формат')).toHaveValue('epub');
    expect(screen.getByLabelText('Видимость')).toHaveValue('private');
  });

  it('отправляет FormData и после public upload обновляет библиотеку и каталог', async () => {
    const uploadedBook = {
      ...publicBook,
      id: 'eb56e24a-6c4c-4dbf-903c-768df56e1ed4',
      title: 'Загруженная публичная книга',
      author: 'Новый автор',
      description: 'Новое описание',
      format: 'pdf',
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
    expect(uploadOptions.body).toBeInstanceOf(FormData);
    expect(uploadOptions.headers).not.toHaveProperty('Content-Type');
    expect(uploadOptions.body.get('file')).toEqual(values.file);
    expect(uploadOptions.body.get('title')).toBe(values.title);
    expect(uploadOptions.body.get('author')).toBe(values.author);
    expect(uploadOptions.body.get('description')).toBe(values.description);
    expect(uploadOptions.body.get('format')).toBe('pdf');
    expect(uploadOptions.body.get('visibility')).toBe('public');

    await browser.click(screen.getByRole('button', { name: 'Загрузить книгу' }));
    expect(screen.getByLabelText('Название')).toHaveValue('');
    expect(screen.getByLabelText('Автор')).toHaveValue('');
    expect(screen.getByLabelText('Описание')).toHaveValue('');
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
