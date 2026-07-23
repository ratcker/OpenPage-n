// Общие иконки
export function GridIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function ProfileIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 10.1a3.55 3.55 0 1 0 0-7.1 3.55 3.55 0 0 0 0 7.1Zm-6 6.8c.38-3.02 2.87-4.85 6-4.85s5.62 1.83 6 4.85" />
    </svg>
  );
}
