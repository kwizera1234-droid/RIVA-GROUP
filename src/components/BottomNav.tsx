import React from 'react';
import { Activity, History, Bell, Settings } from 'lucide-react';
import { motion } from 'motion/react';
import { ActiveScreen, Language } from '../types';
import { translations } from '../i18n/translations';

interface BottomNavProps {
  currentScreen: ActiveScreen;
  onNavigate: (screen: ActiveScreen) => void;
  language: Language;
  hasActiveDanger?: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({ 
  currentScreen, 
  onNavigate,
  language,
  hasActiveDanger = false
}) => {
  const t = translations[language] || translations.en;

  const tabs: { id: ActiveScreen; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'dashboard', label: t.dashboardTab, icon: Activity },
    { id: 'health', label: 'Health', icon: Activity },
    { id: 'reports', label: 'Reports', icon: History },
    { id: 'history', label: t.historyTab, icon: History },
    { id: 'alerts', label: t.alertsTab, icon: Bell },
    { id: 'settings', label: t.settingsTab, icon: Settings },
  ];

  return (
    <nav 
      id="main-bottom-navigation"
      aria-label="Main Navigation"
      className="fixed bottom-0 left-0 right-0 z-50 w-full bg-[#08080a]/94 backdrop-blur-2xl border-t border-white/10 shadow-[0_-10px_35px_rgba(0,0,0,0.85)]"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
    >
      <div className="max-w-lg mx-auto px-2 pt-1 flex items-center justify-around gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = currentScreen === tab.id;
          const Icon = tab.icon;
          const isAlertsTab = tab.id === 'alerts';

          return (
            <button
              key={tab.id}
              id={`bottom-nav-${tab.id}`}
              onClick={() => onNavigate(tab.id)}
              className={`relative flex-1 flex flex-col items-center justify-center py-1.5 px-2 transition-all duration-200 cursor-pointer ${
                isActive ? 'text-[#D4AF37]' : 'text-white/45 hover:text-white/80 active:scale-95'
              }`}
            >
              <div className="relative flex flex-col items-center gap-0.5">
                <div className="relative p-1">
                  <Icon className={`w-5 h-5 transition-transform duration-200 ${isActive ? 'scale-110 text-[#D4AF37]' : 'text-white/50'}`} />
                  
                  {/* Danger Alert Ping Badge */}
                  {isAlertsTab && hasActiveDanger && (
                    <>
                      <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-red-500 animate-ping" />
                      <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_#EF4444]" />
                    </>
                  )}
                </div>

                <span className={`text-[11px] font-sans tracking-tight leading-none whitespace-nowrap transition-colors ${
                  isActive ? 'font-bold text-[#D4AF37]' : 'font-medium text-white/50'
                }`}>
                  {tab.label}
                </span>

                {/* Active Indicator Dot */}
                {isActive && (
                  <motion.div
                    layoutId="activeTabDot"
                    className="w-1 h-1 rounded-full bg-[#D4AF37] shadow-[0_0_6px_#D4AF37] mt-0.5"
                    transition={{ type: 'spring', stiffness: 450, damping: 30 }}
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

