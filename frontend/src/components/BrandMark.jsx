import logo from '../assets/logo.svg';

// Логотип
export default function BrandMark() {
  return (
    <span className="brand">
      <img src={logo} alt="" />
      <span>Опенпейч</span>
    </span>
  );
}
