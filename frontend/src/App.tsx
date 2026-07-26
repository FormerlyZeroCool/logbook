import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { EventTypePage } from './pages/EventTypePage';
import { EventsPage } from './pages/EventsPage';
import { KioskPage } from './pages/KioskPage';
import { EventTypesPage } from './pages/EventTypesPage';
import { UnitsPage } from './pages/UnitsPage';
import { ExplorePage } from './pages/ExplorePage';
import { ExploreHomePage } from './pages/ExploreHomePage';
import { AnalysisFunctionsPage } from './pages/AnalysisFunctionsPage';
import { AnalysisFunctionPage } from './pages/AnalysisFunctionPage';

export default function App() {
  return <BrowserRouter><Layout><Routes>
    <Route path="/" element={<DashboardPage />} />
    <Route path="/events" element={<EventsPage />} />
    <Route path="/kiosk" element={<KioskPage />} />
    <Route path="/event-types" element={<EventTypesPage />} />
    <Route path="/units" element={<UnitsPage />} />
    <Route path="/types/:key" element={<EventTypePage />} />
    <Route path="/explore" element={<ExploreHomePage />} />
    <Route path="/explore/new" element={<ExplorePage />} />
    <Route path="/explore/:explorationId" element={<ExplorePage />} />
    <Route path="/analysis-functions" element={<AnalysisFunctionsPage />} />
    <Route path="/analysis-functions/:functionId" element={<AnalysisFunctionPage />} />
  </Routes></Layout></BrowserRouter>;
}
