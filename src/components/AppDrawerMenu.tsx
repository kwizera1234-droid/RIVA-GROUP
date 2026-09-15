import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  ShieldAlert, 
  Bell, 
  HelpCircle, 
  Shield, 
  Info, 
  ChevronRight, 
  LogOut, 
  Globe, 
  Check, 
  Cpu,
  Mic
} from 'lucide-react';
import { SettingsSubPage, UserProfile, Language, ReadingStatus } from '../types';
import { SoberWatchLogo } from './SoberWatchLogo';
import { translations } from '../i18n/translations';

interface AppDrawerMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSubPage: (subPage: SettingsSubPage) => void;
  user: UserProfile | null;
  deviceId: string;
  status?: ReadingStatus;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  onSignOut: () => void;
}

export const AppDrawerMenu: React.FC<AppDrawerMenuProps> = ({
  isOpen,
  onClose,
  onSelectSubPage,
  user,
  deviceId,
  status,
  language,
  onLanguageChange,
  onSignOut
}) => {
  const t = translations[language] || translations.en;

  const menuItems: {
    id: SettingsSubPage;
    title: string;
    desc: string;
    icon: React.ComponentType<{ className?: string }>;
    tag?: string;
  }[] = [
    {
      id: 'voice',
      title: t.voiceAssistantTitle || 'AI Voice Assistant',
      desc: t.voiceAssistantSubtitle || 'Kinyarwanda & Emergency Voice Commands',
      icon: Mic,
      tag: 'Kinyarwanda AI'
    },
    {
      id: 'emergency',
      title: t.emergencyContactsTitle,
      desc: t.emergencyContactsDesc,
      icon: ShieldAlert,
    },
    {
      id: 'notifications',
      title: t.notificationsTitle,
      desc: t.notificationsDesc,
      icon: Bell,
    },
    {
      id: 'support',
      title: t.helpSupportTitle,
      desc: t.helpSupportDesc,
      icon: HelpCircle,
    },
    {
      id: 'privacy',
      title: t.dataPrivacyTitle,
      desc: t.dataPrivacyDesc,
      icon: Shield,
    },
    {
      id: 'about',
      title: t.aboutTitle,
      desc: t.aboutDesc,
      icon: Info,
    }
  ];

  const languagesList: { code: Language; label: string; name: string }[] = [
    { code: 'rw', label: 'RW', name: 'Kinyarwanda' },
    { code: 'en', label: 'EN', name: 'English' },
    { code: 'fr', label: 'FR', name: 'Français' },
    { code: 'sw', label: 'SW', name: 'Kiswahili' },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop Blur Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity cursor-pointer"
          />

          {/* Sliding Side Drawer Panel */}
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="w-screen max-w-md bg-black/95 border-l border-white/10 backdrop-blur-[32px] p-6 shadow-2xl flex flex-col justify-between overflow-y-auto"
            >
              {/* Top Drawer Header */}
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div className="flex items-center gap-2.5">
                    <SoberWatchLogo size={28} variant="original" />
                    <div>
                      <div className="font-luxury font-bold text-white text-lg tracking-tight leading-tight">
                        {t.appName}
                      </div>
                      <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">
                        {t.menuTitle}
                      </div>
                    </div>
                  </div>

                  <button
                    id="close-drawer-menu-btn"
                    onClick={onClose}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* User Profile Card Summary */}
                <div className="p-4 rounded-[16px] bg-white/[0.03] border border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full p-[2px] bg-gradient-to-tr from-[#D4AF37] via-amber-300 to-cyan-400 shrink-0">
                      <div className="w-full h-full rounded-full overflow-hidden bg-black flex items-center justify-center">
                        {user?.photoUrl ? (
                          <img 
                            src={user.photoUrl} 
                            alt={user.displayName || 'Profile'} 
                            className="w-full h-full object-cover" 
                          />
                        ) : (
                          <span className="font-luxury font-bold text-sm text-[#D4AF37]">
                            {user?.displayName ? user.displayName.charAt(0).toUpperCase() : (user?.email ? user.email.charAt(0).toUpperCase() : 'U')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="font-luxury font-bold text-white text-sm">
                        {user?.displayName || (user?.isGuest ? t.guestLogin : 'Patron')}
                      </div>
                      <div className="text-[11px] font-mono text-white/50 truncate max-w-[170px]">
                        {user?.email || 'guest@soberwatch.io'}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-mono text-[#D4AF37] bg-[#D4AF37]/10 px-2 py-0.5 rounded-full border border-[#D4AF37]/20">
                      {deviceId || 'Unavailable'}
                    </span>
                  </div>
                </div>

                {/* The 5 Requested Menu Items */}
                <div className="space-y-2">
                  <div className="text-[10px] font-mono text-white/40 uppercase tracking-wider px-1">
                    {t.menuSubtitle}
                  </div>

                  {menuItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        id={`drawer-menu-item-${item.id}`}
                        onClick={() => {
                          onSelectSubPage(item.id);
                          onClose();
                        }}
                        className="w-full text-left p-3.5 rounded-[16px] bg-white/[0.03] hover:bg-white/[0.07] border border-white/5 hover:border-[#D4AF37]/40 transition flex items-center justify-between group cursor-pointer"
                      >
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-xl bg-white/5 border border-white/10 text-[#D4AF37] group-hover:bg-[#D4AF37]/20 transition shrink-0 mt-0.5">
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-luxury font-bold text-white text-sm group-hover:text-[#D4AF37] transition">
                              {item.title}
                            </div>
                            <div className="text-[11px] text-white/50 font-sans line-clamp-1 mt-0.5">
                              {item.desc}
                            </div>
                          </div>
                        </div>

                        <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-[#D4AF37] group-hover:translate-x-0.5 transition shrink-0 ml-2" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Bottom Drawer Actions */}
              <div className="space-y-4 pt-6 border-t border-white/10 mt-6">
                {/* Language Switcher Row */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-mono text-white/40 uppercase tracking-wider">
                    {t.language}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {languagesList.map((lang) => (
                      <button
                        key={lang.code}
                        id={`drawer-lang-${lang.code}`}
                        onClick={() => onLanguageChange(lang.code)}
                        className={`py-2 px-2.5 rounded-xl text-xs font-mono transition flex items-center justify-center gap-1.5 cursor-pointer ${
                          language === lang.code
                            ? 'bg-[#D4AF37]/20 border border-[#D4AF37] text-[#D4AF37] font-bold'
                            : 'bg-white/5 border border-white/5 text-white/60 hover:text-white'
                        }`}
                      >
                        <span>{lang.name}</span>
                        {language === lang.code && <Check className="w-3 h-3 text-[#D4AF37]" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sign Out Button */}
                <button
                  id="drawer-signout-btn"
                  onClick={() => {
                    onClose();
                    onSignOut();
                  }}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 text-white/70 hover:text-red-300 text-xs font-mono transition cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{t.signOut}</span>
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};
