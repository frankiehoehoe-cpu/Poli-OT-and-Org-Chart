import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { LanguageProvider } from './lib/LanguageContext';
import LoginPage from './LoginPage';
import EmployeePortal from './EmployeePortal';
import SupervisorPortal from './SupervisorPortal';
import ManagerPortal from './ManagerPortal';

import LandingPage from './LandingPage';
import WelcomePage from './WelcomePage';

function AppContent() {
  const { role, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<WelcomePage />} />
      <Route path="/overview" element={<LandingPage />} />
      <Route 
        path="/portal" 
        element={
          role === 'employee' ? <EmployeePortal /> :
          role === 'supervisor' ? <SupervisorPortal /> :
          role === 'manager' ? <ManagerPortal /> :
          <Navigate to="/" replace />
        } 
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}
