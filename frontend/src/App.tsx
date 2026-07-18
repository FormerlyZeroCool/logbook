import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { EventTypePage } from './pages/EventTypePage';
import { EventsPage } from './pages/EventsPage';
import { EventTypesPage } from './pages/EventTypesPage';
import { UnitsPage } from './pages/UnitsPage';

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/event-types" element={<EventTypesPage />} />
          <Route path="/units" element={<UnitsPage />} />
          <Route path="/types/:key" element={<EventTypePage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
