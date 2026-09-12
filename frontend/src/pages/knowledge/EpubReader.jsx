import { useEffect, useRef, useState } from 'react';
import ePub from 'epubjs';

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export default function EpubReader({
  contentUrl,
  initialLocation,
  fontSize,
  onPositionChange,
  onContentError,
}) {
  const containerRef = useRef(null);
  const renditionRef = useRef(null);
  const fontSizeRef = useRef(fontSize);
  const [isReady, setIsReady] = useState(false);
  fontSizeRef.current = fontSize;

  useEffect(() => {
    let active = true;
    const book = ePub(contentUrl);
    const rendition = book.renderTo(containerRef.current, {
      manager: 'continuous',
      flow: 'scrolled',
      width: '100%',
      height: '100%',
    });
    renditionRef.current = rendition;
    rendition.themes.fontSize(`${fontSizeRef.current}%`);

    function handleLocation(location) {
      const cfi = location?.start?.cfi;
      if (!active || !cfi) return;

      const percentage = book.locations.length()
        ? book.locations.percentageFromCfi(cfi) * 100
        : 0;

      onPositionChange({
        reading_location: { type: 'epub', location: cfi },
        reading_percentage: Number(clamp(percentage, 0, 100).toFixed(2)),
      });
    }

    function handleError(error) {
      if (active) onContentError(error);
    }

    rendition.on('relocated', handleLocation);
    rendition.on('displayerror', handleError);
    book.on('openFailed', handleError);

    // Список locations строится один раз и позволяет перевести CFI в проценты.
    book.ready
      .then(() => book.locations.generate(1600))
      .then(() => rendition.display(
        initialLocation?.type === 'epub' ? initialLocation.location : undefined,
      ))
      .then(() => {
        if (active) setIsReady(true);
      })
      .catch(handleError);

    return () => {
      active = false;
      rendition.off('relocated', handleLocation);
      rendition.off('displayerror', handleError);
      book.off('openFailed', handleError);
      rendition.destroy();
      book.destroy();
      renditionRef.current = null;
    };
  }, [contentUrl, initialLocation, onContentError, onPositionChange]);

  useEffect(() => {
    renditionRef.current?.themes.fontSize(`${fontSize}%`);
  }, [fontSize]);

  return (
    <section className="epub-reader" aria-label="EPUB reader">
      {!isReady && <p className="reader-renderer-loading">Подготавливаем EPUB…</p>}
      <div
        className={`epub-reader-view${isReady ? ' is-ready' : ''}`}
        ref={containerRef}
      />
    </section>
  );
}
