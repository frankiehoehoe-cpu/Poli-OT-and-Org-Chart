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
      if (savedUser) setUser(JSON.parse(savedUser));
    }
    setIsLoading(false);
  }, []);

  const login = (role: Role, user?: UserProfile) => {
    setRole(role);
    if (user) setUser(user);
    sessionStorage.setItem('userRole', role);
    if (user) sessionStorage.setItem('userData', JSON.stringify(user));
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
