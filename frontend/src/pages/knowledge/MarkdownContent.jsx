import ReactMarkdown from 'react-markdown';

// Raw HTML намеренно игнорируется: Markdown остаётся безопасным React-деревом.
export default function MarkdownContent({ children }) {
  return (
    <div className="markdown-content">
      <ReactMarkdown skipHtml>{children}</ReactMarkdown>
    </div>
  );
}
