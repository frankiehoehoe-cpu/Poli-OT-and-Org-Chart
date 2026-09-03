import React, { createContext, useContext, useState, useEffect } from 'react';
import { Role, UserProfile } from '../types';

interface AuthContextType {
  role: Role | null;
  user: UserProfile | null;
  login: (role: Role, user?: UserProfile) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedRole = sessionStorage.getItem('userRole') as Role;
    const savedUser = sessionStorage.getItem('userData');
    
    if (savedRole) {
      setRole(savedRole);
      if (savedUser) {
        const parsed = JSON.parse(savedUser) as UserProfile;
        const safeUser = { id: parsed.id, name: parsed.name, role: parsed.role, ...(parsed.department ? { department: parsed.department } : {}) };
        setUser(safeUser);
        sessionStorage.setItem('userData', JSON.stringify(safeUser));
      }
    }
    setIsLoading(false);
  }, []);

  const login = (role: Role, user?: UserProfile) => {
    setRole(role);
    const safeUser = user ? { id: user.id, name: user.name, role: user.role, ...(user.department ? { department: user.department } : {}) } : undefined;
    if (safeUser) setUser(safeUser);
    sessionStorage.setItem('userRole', role);
    if (safeUser) sessionStorage.setItem('userData', JSON.stringify(safeUser));
  };

  const logout = () => {
    setRole(null);
    setUser(null);
    sessionStorage.clear();
  };

  return (
    <AuthContext.Provider value={{ role, user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
