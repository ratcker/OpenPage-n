import { useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export default function PdfReader({
  contentUrl,
  initialLocation,
  scale,
  onPositionChange,
  onContentError,
}) {
  const scrollRef = useRef(null);
  const pageRefs = useRef([]);
  const frameRef = useRef(null);
  const restoredRef = useRef(false);
  const [numPages, setNumPages] = useState(0);
  const [isReady, setIsReady] = useState(false);

  const savedPage = initialLocation?.type === 'pdf'
    ? Math.max(1, Number(initialLocation.page) || 1)
    : 1;

  useEffect(() => {
    restoredRef.current = false;
    pageRefs.current = [];
    setNumPages(0);
    setIsReady(false);
  }, [contentUrl]);

  useEffect(() => () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
  }, []);

  function reportPosition() {
    const container = scrollRef.current;
    if (!container || !numPages || !restoredRef.current) return;

    const marker = container.scrollTop + container.clientHeight * 0.35;
    let currentPage = 1;

    pageRefs.current.forEach((element, index) => {
      if (element && element.offsetTop <= marker) currentPage = index + 1;
    });

    const maximumScroll = container.scrollHeight - container.clientHeight;
    const percentage = maximumScroll > 0
      ? (container.scrollTop / maximumScroll) * 100
      : ((currentPage - 1) / Math.max(numPages - 1, 1)) * 100;

    onPositionChange({
      reading_location: { type: 'pdf', page: currentPage },
      reading_percentage: Number(clamp(percentage, 0, 100).toFixed(2)),
    });
  }

  function handleScroll() {
    if (frameRef.current) return;
    // Позиция пересчитывается не чаще одного раза за кадр браузера.
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      reportPosition();
    });
  }

  function handlePageRendered(pageNumber) {
    if (restoredRef.current || pageNumber !== clamp(savedPage, 1, numPages)) return;

    const container = scrollRef.current;
    const page = pageRefs.current[pageNumber - 1];
    if (container && page) container.scrollTop = page.offsetTop;

    restoredRef.current = true;
    setIsReady(true);
  }

  return (
    <section className="pdf-reader" aria-label="PDF reader">
      {!isReady && <p className="reader-renderer-loading">Подготавливаем PDF…</p>}
      <div
        className={`pdf-reader-scroll${isReady ? ' is-ready' : ''}`}
        ref={scrollRef}
        onScroll={handleScroll}
      >
        <Document
          file={contentUrl}
          loading={null}
          onLoadSuccess={({ numPages: pages }) => setNumPages(pages)}
          onLoadError={onContentError}
          onSourceError={onContentError}
        >
          {Array.from({ length: numPages }, (_, index) => {
            const pageNumber = index + 1;
            return (
              <div
                className="pdf-page"
                key={pageNumber}
                ref={(element) => { pageRefs.current[index] = element; }}
                data-page={pageNumber}
              >
                <Page
                  pageNumber={pageNumber}
                  scale={scale}
                  devicePixelRatio={Math.min(window.devicePixelRatio || 1, 2)}
                  renderAnnotationLayer={false}
                  loading=""
                  onLoadError={onContentError}
                  onRenderError={onContentError}
                  onRenderSuccess={() => handlePageRendered(pageNumber)}
                />
              </div>
            );
          })}
        </Document>
      </div>
    </section>
  );
}
