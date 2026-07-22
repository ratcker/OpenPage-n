import Footer from './Footer.jsx';
import Header from './Header.jsx';

// Общий каркас
export default function SiteLayout({ children }) {
  return (
    <div className="page">
      <a className="skip-link" href="#content">
        К контенту
      </a>

      <Header />
      <main id="content">{children}</main>
      <Footer />
    </div>
  );
}
