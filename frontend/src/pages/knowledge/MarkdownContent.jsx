import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';

import { authorizedBlobRequest } from '../../api/client.js';

const ARTICLE_IMAGE_PATH = '/api/knowledge/article-images/';

function AuthorizedArticleImage({ src, alt, ...props }) {
  const [state, setState] = useState({ status: 'loading', url: '' });

  useEffect(() => {
    let isActive = true;
    let objectUrl = '';

    authorizedBlobRequest(src)
      .then((blob) => {
        if (!isActive) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ status: 'ready', url: objectUrl });
      })
      .catch(() => {
        if (isActive) setState({ status: 'error', url: '' });
      });

    return () => {
      isActive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (state.status === 'error') {
    return <span className="markdown-image-error">Изображение недоступно</span>;
  }
  if (state.status === 'loading') {
    return <span className="markdown-image-loading">Загружаем изображение…</span>;
  }
  return <img {...props} src={state.url} alt={alt || ''} />;
}

function AuthenticatedMarkdownImage({ src, alt, title }) {
  if (src?.startsWith(ARTICLE_IMAGE_PATH)) {
    return <AuthorizedArticleImage src={src} alt={alt} title={title} />;
  }
  return <img src={src} alt={alt || ''} title={title} />;
}

const authenticatedComponents = { img: AuthenticatedMarkdownImage };

// Raw HTML намеренно игнорируется: Markdown остаётся безопасным React-деревом.
export default function MarkdownContent({ children, authenticatedImages = false }) {
  return (
    <div className="markdown-content">
      <ReactMarkdown
        components={authenticatedImages ? authenticatedComponents : undefined}
        skipHtml
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
