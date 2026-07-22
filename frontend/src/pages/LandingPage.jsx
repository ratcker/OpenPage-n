import SiteLayout from '../components/SiteLayout.jsx';

// Лендинг
export default function LandingPage() {
  return (
    <SiteLayout>
      <div className="landing">
        <a className="hub-button" href="/hub" aria-label="Перейти в хаб" title="Хаб">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m7 4 6 6-6 6" />
          </svg>
        </a>
      </div>
    </SiteLayout>
  );
}
