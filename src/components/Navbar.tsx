import React, { useState } from 'react';
import { Globe, Check, Menu, Bell, User } from 'lucide-react';
import { ReadingStatus, Language, UserProfile, ActiveScreen } from '../types';
import { SoberWatchLogo } from './SoberWatchLogo';
import { translations } from '../i18n/translations';

interface NavbarProps {
  deviceId: string;
  status?: ReadingStatus;
  user?: UserProfile | null;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  onOpenMenu?: () => void;
  onNavigate?: (screen: ActiveScreen) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ 
  deviceId, 
  user,
  language,
  onLanguageChange,
  onOpenMenu,
  onNavigate
}) => {
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const t = translations[language] || translations.en;

  const topMenuItems: { label: string; screen: ActiveScreen }[] = [
    { label: 'Home', screen: 'dashboard' },
    { label: 'Health', screen: 'health' },
    { label: 'Reports', screen: 'reports' },
  ];

  const languagesList: { code: Language; label: string; name: string }[] = [
    { code: 'rw', label: 'RW', name: 'Kinyarwanda' },
    { code: 'en', label: 'EN', name: 'English' },
    { code: 'fr', label: 'FR', name: 'Français' },
    { code: 'sw', label: 'SW', name: 'Kiswahili' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full px-3 sm:px-6 py-2.5 backdrop-blur-[24px] bg-[#05070B]/90 border-b border-white/10 shadow-lg">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* App Logo & Name */}
        <div className="flex items-center gap-2.5">
          <SoberWatchLogo size={30} variant="original" />
          <div>
            <h1 className="font-luxury text-lg sm:text-xl font-bold tracking-tight text-white leading-none">
              {t.appName}
            </h1>
            <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest">
              {t.subtitle}
            </span>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          {topMenuItems.map((item) => (
            <button
              key={item.screen}
              type="button"
              onClick={() => onNavigate?.(item.screen)}
              className="px-3.5 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-[0.18em] text-white/70 transition hover:text-[#D4AF37] hover:bg-white/[0.04] cursor-pointer"
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Top Controls: Bell Notification, Language & User Avatar */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Notification Bell Icon (Akazogera) */}
          {onNavigate && (
            <button
              id="header-notifications-bell-btn"
              onClick={() => onNavigate('alerts')}
              title={t.alertsTab}
              className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition cursor-pointer active:scale-90"
            >
              <Bell className="w-5 h-5 text-white/80 hover:text-[#D4AF37] transition-colors" />
            </button>
          )}

          {/* Quick Language Switcher Dropdown */}
          <div className="relative">
            <button
              id="lang-switcher-btn"
              onClick={() => setLangMenuOpen(!langMenuOpen)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-mono transition cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span className="font-bold uppercase text-[11px]">{language}</span>
            </button>

            {langMenuOpen && (
              <div 
                className="absolute right-0 mt-2 w-44 rounded-[16px] bg-black/95 backdrop-blur-[24px] border border-white/15 p-1.5 shadow-[0_10px_35px_rgba(0,0,0,0.9)] z-50 animate-in fade-in zoom-in-95 duration-150"
              >
                {languagesList.map((item) => (
                  <button
                    key={item.code}
                    id={`lang-select-${item.code}`}
                    onClick={() => {
                      onLanguageChange(item.code);
                      setLangMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-mono transition cursor-pointer ${
                      language === item.code
                        ? 'bg-[#D4AF37]/20 text-[#D4AF37] font-bold'
                        : 'text-white/70 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span>{item.name}</span>
                    {language === item.code && <Check className="w-3.5 h-3.5 text-[#D4AF37]" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* User Profile Avatar with Instagram Story-Style Glowing Ring */}
          <button
            id="header-user-avatar-btn"
            onClick={onOpenMenu}
            title={user?.displayName || user?.email || 'User Profile'}
            className="relative flex items-center justify-center p-0.5 rounded-full bg-gradient-to-tr from-[#D4AF37] via-amber-300 to-cyan-400 hover:scale-105 transition-transform cursor-pointer shadow-[0_0_12px_rgba(212,175,55,0.3)]"
          >
            <div className="w-8 h-8 rounded-full overflow-hidden bg-neutral-900 flex items-center justify-center border-2 border-black">
              {user?.photoUrl ? (
                <img 
                  src={user.photoUrl} 
                  alt={user.displayName || 'User Profile'} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="font-luxury font-bold text-xs text-[#D4AF37]">
                  {user?.displayName ? user.displayName.charAt(0).toUpperCase() : (user?.email ? user.email.charAt(0).toUpperCase() : <User className="w-4 h-4 text-white/60" />)}
                </span>
              )}
            </div>
          </button>

          {/* Quick Menu Drawer Trigger Button */}
          {onOpenMenu && (
            <button
              id="header-open-menu-btn"
              onClick={onOpenMenu}
              aria-label={t.quickMenu}
              className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              <Menu className="w-5 h-5 text-white/80" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};


