import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  getKnowledgeBook,
  getKnowledgeBookContent,
  getKnowledgeLibrary,
  updateKnowledgeProgress,
} from '../../api/knowledge.js';
import useAuth from '../../auth/useAuth.js';
import ReaderToolbar from './ReaderToolbar.jsx';

const SAVE_DELAY = 5000;
const MAX_CONTENT_REFRESHES = 1;
const PdfReader = lazy(() => import('./PdfReader.jsx'));
const EpubReader = lazy(() => import('./EpubReader.jsx'));

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function readerErrorMessage(error) {
  if (error?.status === 403) return 'У вас нет доступа к этой книге.';
  if (error?.status === 404) return 'Книга не найдена.';
  return 'Не удалось открыть книгу.';
}

function savedPosition(book, library) {
  const entry = library?.results?.find((item) => item.book.id === book.id);
  const location = entry?.reading_location;
  const percentage = Number(entry?.reading_percentage);

  if (!location || location.type !== book.format) return null;
  if (book.format === 'pdf' && (!Number.isInteger(location.page) || location.page < 1)) {
    return null;
  }
  if (book.format === 'epub' && !location.location) return null;

  return {
    reading_location: location,
    reading_percentage: clamp(Number.isFinite(percentage) ? percentage : 0, 0, 100),
  };
}

export default function ReaderPage() {
  const { id: bookId } = useParams();
  const { status: authStatus } = useAuth();
  const authenticated = authStatus === 'authenticated';
  const readerRef = useRef(null);
  const loadIdRef = useRef(0);
  const saveTimerRef = useRef(null);
  const positionRef = useRef(null);
  const lastSavedRef = useRef('');
  const lastSentRef = useRef('');
  const refreshAttemptsRef = useRef(0);
  const refreshingRef = useRef(false);
  const mountedRef = useRef(true);
  const [reader, setReader] = useState({
    status: 'loading',
    book: null,
    contentUrl: '',
    initialLocation: null,
    error: '',
  });
  const [contentVersion, setContentVersion] = useState(0);
  const [progress, setProgress] = useState(0);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [fontSize, setFontSize] = useState(100);

  const loadReader = useCallback(async () => {
    const loadId = loadIdRef.current + 1;
    loadIdRef.current = loadId;
    refreshAttemptsRef.current = 0;
    refreshingRef.current = false;
    clearTimeout(saveTimerRef.current);
    positionRef.current = null;
    lastSavedRef.current = '';
    lastSentRef.current = '';
    setReader((current) => ({ ...current, status: 'loading', error: '' }));
    setProgress(0);
    setSaveStatus('idle');
    setIsRefreshing(false);

    try {
      const libraryRequest = authenticated
        ? getKnowledgeLibrary().catch(() => null)
        : Promise.resolve(null);
      const [book, content, library] = await Promise.all([
        getKnowledgeBook(bookId, authenticated),
        getKnowledgeBookContent(bookId, authenticated),
        libraryRequest,
      ]);

      if (loadIdRef.current !== loadId) return;
      if (!['pdf', 'epub'].includes(book.format)) {
        throw new Error('Unsupported book format.');
      }

      const position = savedPosition(book, library);
      const signature = position ? JSON.stringify(position) : '';
      positionRef.current = position;
      lastSavedRef.current = signature;
      lastSentRef.current = signature;
      setProgress(position?.reading_percentage || 0);
      setReader({
        status: 'ready',
        book,
        contentUrl: content.url,
        initialLocation: position?.reading_location || null,
        error: '',
      });
      setContentVersion((version) => version + 1);
    } catch (error) {
      if (loadIdRef.current !== loadId) return;
      setReader((current) => ({
        ...current,
        status: 'error',
        error: readerErrorMessage(error),
      }));
    }
  }, [authenticated, bookId]);

  useEffect(() => {
    mountedRef.current = true;
    if (authStatus !== 'loading') loadReader();

    return () => {
      mountedRef.current = false;
      loadIdRef.current += 1;
    };
  }, [authStatus, loadReader]);

  const persistProgress = useCallback(async (position) => {
    const signature = JSON.stringify(position);
    lastSentRef.current = signature;

    try {
      await updateKnowledgeProgress(bookId, position);
      lastSavedRef.current = signature;
      if (mountedRef.current && JSON.stringify(positionRef.current) === signature) {
        setSaveStatus('idle');
      }
    } catch {
      if (lastSentRef.current === signature) lastSentRef.current = '';
      if (mountedRef.current) setSaveStatus('error');
    }
  }, [bookId]);

  useEffect(() => () => {
    clearTimeout(saveTimerRef.current);
    const position = positionRef.current;
    if (!authenticated || !position) return;

    const signature = JSON.stringify(position);
    if (signature === lastSavedRef.current || signature === lastSentRef.current) return;

    // При уходе с route пробуем сохранить позицию без гарантии при закрытии вкладки.
    lastSentRef.current = signature;
    updateKnowledgeProgress(bookId, position).catch(() => {});
  }, [authenticated, bookId]);

  const handlePositionChange = useCallback((nextPosition) => {
    const percentage = clamp(Number(nextPosition.reading_percentage) || 0, 0, 100);
    const position = {
      reading_location: nextPosition.reading_location,
      reading_percentage: Number(percentage.toFixed(2)),
    };
    const signature = JSON.stringify(position);

    positionRef.current = position;
    setProgress(position.reading_percentage);
    if (!authenticated || signature === lastSavedRef.current) return;

    setSaveStatus('idle');
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => persistProgress(position), SAVE_DELAY);
  }, [authenticated, persistProgress]);

  const handleContentError = useCallback(async () => {
    if (refreshingRef.current) return;
    // Один повтор обновляет истёкший URL и не зацикливается на повреждённом файле.
    if (refreshAttemptsRef.current >= MAX_CONTENT_REFRESHES) {
      setReader((current) => ({
        ...current,
        status: 'error',
        error: 'Не удалось загрузить содержимое книги.',
      }));
      return;
    }

    refreshAttemptsRef.current += 1;
    refreshingRef.current = true;
    setIsRefreshing(true);

    try {
      const content = await getKnowledgeBookContent(bookId, authenticated);
      if (!mountedRef.current) return;
      setReader((current) => ({
        ...current,
        contentUrl: content.url,
        initialLocation: positionRef.current?.reading_location || current.initialLocation,
      }));
      setContentVersion((version) => version + 1);
    } catch {
      if (mountedRef.current) {
        setReader((current) => ({
          ...current,
          status: 'error',
          error: 'Не удалось обновить доступ к книге.',
        }));
      }
    } finally {
      refreshingRef.current = false;
      if (mountedRef.current) setIsRefreshing(false);
    }
  }, [authenticated, bookId]);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === readerRef.current);
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await readerRef.current?.requestFullscreen();
      }
    } catch {
      // Отказ браузера в fullscreen не должен прерывать чтение.
    }
  }

  if (authStatus === 'loading' || reader.status === 'loading') {
    return (
      <main className="reader-state" aria-busy="true">
        <p>Открываем книгу…</p>
      </main>
    );
  }

  if (reader.status === 'error') {
    return (
      <main className="reader-state reader-error-state">
        <p className="section-kicker">База знаний</p>
        <h1>{reader.error}</h1>
        <p>Проверьте доступ к книге или попробуйте получить файл ещё раз.</p>
        <div>
          <button type="button" onClick={loadReader}>Повторить</button>
          <Link to="/knowledge">Назад</Link>
        </div>
      </main>
    );
  }

  const rendererProps = {
    contentUrl: reader.contentUrl,
    initialLocation: reader.initialLocation,
    onPositionChange: handlePositionChange,
    onContentError: handleContentError,
  };

  return (
    <main className="reader-page" ref={readerRef}>
      <ReaderToolbar
        book={reader.book}
        progress={progress}
        zoom={zoom}
        fontSize={fontSize}
        isFullscreen={isFullscreen}
        saveStatus={saveStatus}
        onZoomChange={(change) => setZoom((value) => (
          Number(clamp(value + change, 0.75, 1.8).toFixed(2))
        ))}
        onFontSizeChange={(change) => setFontSize((value) => (
          clamp(value + change, 80, 140)
        ))}
        onFullscreen={toggleFullscreen}
      />

      <div className="reader-stage">
        {isRefreshing && (
          <p className="reader-refreshing" role="status">Обновляем доступ к книге…</p>
        )}
        {!isRefreshing && (
          <Suspense fallback={<p className="reader-refreshing">Подготавливаем читалку…</p>}>
            {reader.book.format === 'pdf' && (
              <PdfReader key={contentVersion} {...rendererProps} scale={zoom} />
            )}
            {reader.book.format === 'epub' && (
              <EpubReader key={contentVersion} {...rendererProps} fontSize={fontSize} />
            )}
          </Suspense>
        )}
      </div>
    </main>
  );
}
