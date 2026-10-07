import { Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from './layouts/MainLayout.jsx'
import OpsLayout from './layouts/OpsLayout.jsx'
import { MaritimeProvider } from './state/MaritimeContext.jsx'
import OperationsView from './pages/views/OperationsView.jsx'
import AisView from './pages/views/AisView.jsx'
import PortsView from './pages/views/PortsView.jsx'
import RiskView from './pages/views/RiskView.jsx'
import AnalyticsView from './pages/views/AnalyticsView.jsx'
import EnvironmentView from './pages/views/EnvironmentView.jsx'
import SystemView from './pages/views/SystemView.jsx'
import Status from './pages/Status.jsx'
import LandingPage from './components/landing/LandingPage.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import { RequireAuth } from './auth/AuthContext.jsx'

/**
 * Route map:
 *   /                    cinematic photo-story landing (default)
 *   /login               institutional sign-in (public)
 *   /register            institutional account request (public)
 *   /dashboard           operations center (protected, sidebar shell)
 *   /dashboard/ais       live AIS monitoring
 *   /dashboard/ports     port intelligence
 *   /dashboard/risk      risk center
 *   /dashboard/analytics traffic/congestion analytics
 *   /dashboard/environment marine environment
 *   /dashboard/system    data-source + model health
 *   /status              API connectivity probe
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <MaritimeProvider>
              <OpsLayout />
            </MaritimeProvider>
          </RequireAuth>
        }
      >
        <Route index element={<OperationsView />} />
        <Route path="ais" element={<AisView />} />
        <Route path="ports" element={<PortsView />} />
        <Route path="risk" element={<RiskView />} />
        <Route path="analytics" element={<AnalyticsView />} />
        <Route path="environment" element={<EnvironmentView />} />
        <Route path="system" element={<SystemView />} />
      </Route>
      <Route
        path="/status"
        element={
          <MainLayout>
            <Status />
          </MainLayout>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
