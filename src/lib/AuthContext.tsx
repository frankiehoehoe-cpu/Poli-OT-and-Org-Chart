import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Role, UserProfile } from '../types';
import { setAuthenticatedRole } from './authState';

interface SessionIdentity {
  role: Role;
  subject: string;
  employeeId?: string;
  employeeName?: string;
}

interface AuthContextType {
  role: Role | null;
  user: UserProfile | null;
  login: () => Promise<boolean>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const applyIdentity = useCallback((identity: SessionIdentity | null) => {
    const nextRole = identity?.role || null;
    setRole(nextRole);
    setAuthenticatedRole(nextRole);
    setUser(identity?.role === 'employee' && identity.employeeId && identity.employeeName ? {
      id: identity.employeeId,
      name: identity.employeeName,
      role: 'employee'
    } : null);
  }, []);

  const loadSession = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/session', {
        method: 'GET',
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store'
      });
      if (!response.ok) {
        applyIdentity(null);
        return false;
      }
      const result = await response.json() as { authenticated: boolean; identity?: SessionIdentity };
      if (!result.authenticated || !result.identity) {
        applyIdentity(null);
        return false;
      }
      applyIdentity(result.identity);
      return true;
    } catch {
      applyIdentity(null);
      return false;
    }
  }, [applyIdentity]);

  useEffect(() => {
    sessionStorage.removeItem('userRole');
    sessionStorage.removeItem('userData');
    void loadSession().finally(() => setIsLoading(false));
  }, [loadSession]);

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { accept: 'application/json' },
        credentials: 'same-origin'
      });
    } finally {
      sessionStorage.removeItem('userRole');
      sessionStorage.removeItem('userData');
      applyIdentity(null);
    }
  };

  return (
    <AuthContext.Provider value={{ role, user, login: loadSession, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
