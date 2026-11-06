import Hero from '../Hero/Hero.jsx';
import Services from '../Services/Services.jsx';
import SiteLayout from '../../../components/SiteLayout.jsx';

// Страница хаба
export default function HubPage() {
  return (
    <SiteLayout>
      <Hero />
      <Services />
    </SiteLayout>
  );
}
