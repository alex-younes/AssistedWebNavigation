import Layout from './components/layout/Layout';
import Session from './components/Session';
import Graph from './components/Graph';
import LoginView from './views/LoginView';
import AdminDashboardView from './views/AdminDashboardView';
import ProtectedRoute from './components/auth/ProtectedRoute';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import './App.css';
import AIAnalysisView from './views/AIAnalysisView';

function App() {
  const { user } = useAuth();

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/login" element={<LoginView />} />

          <Route element={<ProtectedRoute />}>
            <Route 
              path="/" 
              element={user?.isAdmin ? <Navigate to="/admin/dashboard" replace /> : <Session />} 
            />
            <Route path="/graph/:sessionId" element={<Graph />} />
            <Route path="/ai-analysis" element={<AIAnalysisView />} />
          </Route>

          <Route element={<ProtectedRoute isAdminRoute />}>
            <Route path="/admin/dashboard" element={<AdminDashboardView />} />
          </Route>
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
