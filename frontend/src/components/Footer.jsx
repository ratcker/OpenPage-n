import BrandMark from './BrandMark.jsx';

// Футер
export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <BrandMark />
        <p>Цифровые сервисы</p>
        <span className="footer-domain">опенпейч.рф</span>
      </div>
    </footer>
  );
}
