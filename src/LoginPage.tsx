import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { LogIn, User, Shield, Briefcase, Globe } from 'lucide-react';
import { useAuth } from './lib/AuthContext';
import { useTranslation } from './lib/LanguageContext';
import { Role } from './types';

export default function LoginPage({ forceRoleSelection = false, onBack }: { forceRoleSelection?: boolean, onBack?: () => void }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t, language, setLanguage } = useTranslation();
  const [activeRole, setActiveRole] = useState<Role | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleRoleSelection = (role: Role) => {
    setActiveRole(role);
    setError('');
    setPassword('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activeRole !== 'supervisor' && activeRole !== 'manager') return;
    const response = await fetch('/api/staff/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: activeRole, password }) });
    setPassword('');
    if (!response.ok) return setError(t('wrongPassword'));
    const result = await response.json() as { verified: boolean; role?: Role };
    if (!result.verified || result.role !== activeRole) return setError(t('wrongPassword'));
    login(activeRole);
    navigate('/portal');
  };

  return (
    <div className={`${!forceRoleSelection ? 'min-h-screen flex items-center justify-center bg-slate-50 p-6' : 'w-full'}`}>
      {!forceRoleSelection && (
        <div className="absolute top-6 right-6">
          <button 
            onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
            className="flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm hover:shadow-md transition-shadow text-sm font-medium border border-slate-200"
          >
            <Globe className="w-4 h-4" />
            {t('language')}
          </button>
        </div>
      )}

      <motion.div 
        initial={!forceRoleSelection ? { opacity: 0, y: 20 } : {}}
        animate={!forceRoleSelection ? { opacity: 1, y: 0 } : {}}
        className={`bg-white rounded-3xl shadow-xl shadow-slate-200/50 p-8 border border-slate-100 ${forceRoleSelection ? 'w-full' : 'w-full max-w-md'}`}
      >
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-vibrant text-white mb-4 shadow-lg shadow-indigo-100">
            <span className="text-xl font-black">{activeRole ? activeRole.slice(0, 1).toUpperCase() : 'T'}</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 leading-tight">
            {activeRole ? (activeRole === 'manager' ? t('manager') : t('supervisor')) : t('adminLogin')}
          </h1>
          <p className="text-slate-700 mt-2 font-medium text-xs">{t('login')}</p>
        </div>

        <div className="space-y-4">
          <AnimatePresence mode="wait">
            {!activeRole ? (
              <motion.div 
                key="role-select"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="grid grid-cols-1 gap-4"
              >
                <RoleButton 
                  icon={<Shield className="w-5 h-5" />} 
                  label={t('supervisor')} 
                  onClick={() => handleRoleSelection('supervisor')} 
                  variant="supervisor"
                />
                <RoleButton 
                  icon={<Briefcase className="w-5 h-5" />} 
                  label={t('manager')} 
                  onClick={() => handleRoleSelection('manager')} 
                  variant="manager"
                />
                {!forceRoleSelection && (
                  <RoleButton 
                    icon={<User className="w-5 h-5" />} 
                    label={t('employee')} 
                    onClick={() => {
                      login('employee');
                      navigate('/portal');
                    }} 
                    variant="employee"
                  />
                )}
              </motion.div>
            ) : (
              <motion.div
                key="password-entry"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <form onSubmit={handleLogin} className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">{t('password')}</label>
                    <input 
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoFocus
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-center tracking-widest font-bold"
                      placeholder="••••••"
                    />
                    {error && <p className="text-red-500 text-xs mt-3 text-center bg-red-50 py-2 rounded-lg font-bold">{error}</p>}
                  </div>
                  
                  <div className="flex gap-3">
                    <button 
                      type="button"
                      onClick={() => activeRole ? setActiveRole(null) : onBack?.()}
                      className="flex-1 px-4 py-3 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition-colors text-sm"
                    >
                      {t('back')}
                    </button>
                    <button 
                      type="submit"
                      className="flex-3 bg-vibrant text-white px-8 py-3 rounded-xl font-bold hover:bg-vibrant-hover transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 text-sm"
                    >
                      <LogIn className="w-4 h-4" />
                      {t('login')}
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

function RoleButton({ icon, label, onClick, variant }: { icon: React.ReactNode, label: string, onClick: () => void, variant: string }) {
  const colors = {
    employee: 'hover:bg-slate-50 border-slate-200 text-slate-700',
    supervisor: 'hover:bg-slate-50 border-slate-200 text-slate-700',
    manager: 'hover:bg-indigo-50 border-indigo-200 text-indigo-700'
  };

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-4 p-5 w-full bg-white border rounded-2xl text-left transition-all hover:shadow-md group ${colors[variant as keyof typeof colors]}`}
    >
      <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center group-hover:bg-white transition-colors border border-slate-100">
        <div className="text-slate-600 group-hover:text-vibrant transition-colors">
          {icon}
        </div>
      </div>
      <div>
        <span className="text-lg font-bold text-slate-900 block">{label}</span>
        <span className="text-[10px] font-bold text-slate-700 uppercase tracking-widest">
          {variant === 'employee' ? 'Staff Level' : variant === 'supervisor' ? 'Auth Required' : 'Full Control'}
        </span>
      </div>
    </button>
  );
}
