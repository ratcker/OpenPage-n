import { useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const preloadRadius = 2;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function initialPage(location, numPages) {
  if (location?.type !== 'pdf') return 1;
  const value = Number(location.page);
  if (!Number.isFinite(value)) return 1;
  return clamp(Math.trunc(value), 1, numPages);
}

function renderedPageNumbers(currentPage, numPages) {
  if (!currentPage || !numPages) return [];
  const firstPage = Math.max(1, currentPage - preloadRadius);
  const lastPage = Math.min(numPages, currentPage + preloadRadius);
  return Array.from(
    { length: lastPage - firstPage + 1 },
    (_, index) => firstPage + index,
  );
}

function pageProgress(page, numPages) {
  const percentage = numPages <= 1
    ? 100
    : ((page - 1) / (numPages - 1)) * 100;
  return Number(clamp(percentage, 0, 100).toFixed(2));
}

function isRenderCancellation(error) {
  const name = String(error?.name || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return name.includes('cancel')
    || name === 'abortexception'
    || message.includes('rendering cancelled')
    || message.includes('rendering canceled');
}

function hasOwnKeyboardBehavior(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(
    'input, textarea, select, button, a, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="slider"]',
  ));
}

export default function PdfReader({
  contentUrl,
  initialLocation,
  scale,
  onPositionChange,
  onContentError,
}) {
  const currentPageRef = useRef(null);
  const resumePageRef = useRef(null);
  const renderedPagesRef = useRef(new Map());
  const pendingReportRef = useRef(null);
  const lastReportedPageRef = useRef(null);
  const navigationRef = useRef(null);
  const initialLocationRef = useRef(initialLocation);
  const contentUrlRef = useRef(contentUrl);
  const scaleRef = useRef(scale);
  const mountedRef = useRef(true);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(null);
  const [loadedContentUrl, setLoadedContentUrl] = useState('');
  const [pageInput, setPageInput] = useState('');
  const [scrubPage, setScrubPage] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [preloadErrors, setPreloadErrors] = useState([]);

  initialLocationRef.current = initialLocation;
  contentUrlRef.current = contentUrl;
  scaleRef.current = scale;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    resumePageRef.current = currentPageRef.current
      ? { type: 'pdf', page: currentPageRef.current }
      : initialLocationRef.current;
    currentPageRef.current = null;
    renderedPagesRef.current.clear();
    pendingReportRef.current = null;
    lastReportedPageRef.current = null;
    setNumPages(0);
    setCurrentPage(null);
    setLoadedContentUrl('');
    setPageInput('');
    setScrubPage(null);
    setIsReady(false);
    setPreloadErrors([]);
  }, [contentUrl]);

  useEffect(() => {
    renderedPagesRef.current.clear();
    setIsReady(false);
    setPreloadErrors([]);
  }, [scale]);

  useEffect(() => {
    setPreloadErrors((current) => current.filter(
      (pageNumber) => currentPage && Math.abs(pageNumber - currentPage) <= preloadRadius,
    ));
  }, [currentPage]);

  function reportPage(pageNumber) {
    if (!mountedRef.current || lastReportedPageRef.current === pageNumber) return;
    lastReportedPageRef.current = pageNumber;
    onPositionChange({
      reading_location: { type: 'pdf', page: pageNumber },
      reading_percentage: pageProgress(pageNumber, numPages),
    });
  }

  function goToPage(pageNumber) {
    if (loadedContentUrl !== contentUrl || !currentPage || !numPages) return;
    const nextPage = clamp(pageNumber, 1, numPages);
    setPageInput(String(nextPage));
    setScrubPage(nextPage);
    if (nextPage === currentPage) return;

    currentPageRef.current = nextPage;
    pendingReportRef.current = nextPage;
    setCurrentPage(nextPage);

    if (renderedPagesRef.current.get(nextPage) === scale) {
      setIsReady(true);
      reportPage(nextPage);
      pendingReportRef.current = null;
    } else {
      setIsReady(false);
    }
  }

  navigationRef.current = goToPage;

  useEffect(() => {
    function handleKeyDown(event) {
      if (
        event.defaultPrevented
        || event.altKey
        || event.ctrlKey
        || event.metaKey
        || hasOwnKeyboardBehavior(event.target)
      ) return;

      let change = 0;
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') change = -1;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') change = 1;
      if (!change) return;

      const pageNumber = currentPageRef.current;
      if (!pageNumber || !numPages) return;
      const nextPage = clamp(pageNumber + change, 1, numPages);
      if (nextPage === pageNumber) return;

      event.preventDefault();
      navigationRef.current?.(nextPage);
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [numPages]);

  function handleDocumentLoaded({ numPages: pages }) {
    const totalPages = Math.max(1, Math.trunc(Number(pages) || 1));
    const location = resumePageRef.current ?? initialLocationRef.current;
    const pageNumber = initialPage(location, totalPages);

    renderedPagesRef.current.clear();
    currentPageRef.current = pageNumber;
    pendingReportRef.current = pageNumber;
    lastReportedPageRef.current = null;
    setNumPages(totalPages);
    setCurrentPage(pageNumber);
    setLoadedContentUrl(contentUrl);
    setPageInput(String(pageNumber));
    setScrubPage(pageNumber);
    setIsReady(false);
    setPreloadErrors([]);
  }

  function handleDocumentError(error, sourceUrl) {
    if (sourceUrl === contentUrlRef.current && mountedRef.current) {
      onContentError(error);
    }
  }

  function handlePageRendered(pageNumber, renderedScale, sourceUrl) {
    if (sourceUrl !== contentUrlRef.current || !mountedRef.current) return;
    renderedPagesRef.current.set(pageNumber, renderedScale);
    if (pageNumber !== currentPageRef.current) {
      setPreloadErrors((current) => (
        current.includes(pageNumber)
          ? current.filter((page) => page !== pageNumber)
          : current
      ));
    }

    if (
      pageNumber !== currentPageRef.current
      || renderedScale !== scaleRef.current
    ) return;

    setIsReady(true);
    if (pendingReportRef.current === pageNumber) {
      reportPage(pageNumber);
      pendingReportRef.current = null;
    }
  }

  function handlePageError(pageNumber, error, sourceUrl) {
    if (
      sourceUrl !== contentUrlRef.current
      || !mountedRef.current
      || isRenderCancellation(error)
    ) return;

    if (pageNumber === currentPageRef.current) {
      onContentError(error);
      return;
    }

    setPreloadErrors((current) => (
      current.includes(pageNumber) ? current : [...current, pageNumber]
    ));
  }

  function commitPageInput() {
    const value = pageInput.trim();
    const pageNumber = Number(value);
    if (!value || !Number.isInteger(pageNumber)) {
      setPageInput(currentPage ? String(currentPage) : '');
      return;
    }
    goToPage(pageNumber);
  }

  function commitScrubPage(value) {
    const pageNumber = Number(value);
    if (!Number.isInteger(pageNumber)) {
      setScrubPage(currentPage);
      return;
    }
    goToPage(pageNumber);
  }

  const documentReady = loadedContentUrl === contentUrl && Boolean(currentPage && numPages);
  const displayedPage = documentReady ? (scrubPage ?? currentPage) : null;
  const pageNumbers = documentReady
    ? renderedPageNumbers(currentPage, numPages)
    : [];

  return (
    <section className="pdf-reader" aria-label="PDF reader">
      <div className="pdf-reader-viewport">
        {!isReady && <p className="reader-renderer-loading">Подготавливаем PDF…</p>}
        <div className={`pdf-reader-scroll${isReady ? ' is-ready' : ''}`}>
          <Document
            key={contentUrl}
            className="pdf-reader-document"
            file={contentUrl}
            loading={null}
            onLoadSuccess={handleDocumentLoaded}
            onLoadError={(error) => handleDocumentError(error, contentUrl)}
            onSourceError={(error) => handleDocumentError(error, contentUrl)}
          >
            {pageNumbers.map((pageNumber) => {
              const isCurrent = pageNumber === currentPage;
              const retryCurrentPage = isCurrent && preloadErrors.includes(pageNumber);
              return (
                <div
                  className={isCurrent ? 'pdf-page' : 'pdf-page-preload'}
                  key={retryCurrentPage ? `${pageNumber}-retry` : pageNumber}
                  data-page={pageNumber}
                  aria-hidden={isCurrent ? undefined : 'true'}
                >
                  <Page
                    pageNumber={pageNumber}
                    scale={scale}
                    devicePixelRatio={Math.min(window.devicePixelRatio || 1, 2)}
                    renderTextLayer={isCurrent}
                    renderAnnotationLayer={false}
                    loading=""
                    onLoadError={(error) => handlePageError(pageNumber, error, contentUrl)}
                    onRenderError={(error) => handlePageError(pageNumber, error, contentUrl)}
                    onRenderSuccess={() => handlePageRendered(pageNumber, scale, contentUrl)}
                  />
                </div>
              );
            })}
          </Document>
        </div>
      </div>

      <nav className="pdf-page-navigation" aria-label="Навигация по PDF">
        <div className="pdf-page-scrubber">
          <span aria-hidden="true">1</span>
          <input
            type="range"
            min="1"
            max={numPages || 1}
            step="1"
            aria-label="Быстрый переход по страницам"
            aria-valuetext={documentReady
              ? `Страница ${displayedPage} из ${numPages}`
              : 'PDF загружается'}
            disabled={!documentReady || numPages <= 1}
            value={displayedPage || 1}
            onPointerUp={(event) => commitScrubPage(event.currentTarget.value)}
            onPointerCancel={() => {
              setScrubPage(currentPage);
            }}
            onChange={(event) => setScrubPage(Number(event.target.value))}
            onKeyUp={(event) => {
              if (![
                'ArrowLeft',
                'ArrowRight',
                'ArrowUp',
                'ArrowDown',
                'PageUp',
                'PageDown',
                'Home',
                'End',
              ].includes(event.key)) return;
              commitScrubPage(event.currentTarget.value);
            }}
            onBlur={(event) => commitScrubPage(event.currentTarget.value)}
          />
          <span aria-hidden="true">{numPages || '—'}</span>
        </div>

        <div className="pdf-page-controls">
          <button
            type="button"
            aria-label="Предыдущая страница"
            disabled={!documentReady || currentPage <= 1}
            onClick={() => goToPage(currentPage - 1)}
          >
            <span aria-hidden="true">←</span>
          </button>
          <output className="pdf-page-count" aria-live="polite">
            {documentReady ? `${displayedPage} / ${numPages}` : '— / —'}
          </output>
          <input
            className="pdf-page-input"
            type="text"
            inputMode="numeric"
            aria-label="Номер страницы"
            disabled={!documentReady}
            value={pageInput}
            onChange={(event) => setPageInput(event.target.value)}
            onBlur={() => setPageInput(currentPage ? String(currentPage) : '')}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              commitPageInput();
            }}
          />
          <button
            type="button"
            aria-label="Следующая страница"
            disabled={!documentReady || currentPage >= numPages}
            onClick={() => goToPage(currentPage + 1)}
          >
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </nav>

      {preloadErrors.some((pageNumber) => pageNumber !== currentPage) && (
        <p className="pdf-preload-warning" role="status">
          Не удалось заранее подготовить соседнюю страницу. Она загрузится при открытии.
        </p>
      )}
    </section>
  );
}
