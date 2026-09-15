import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LogOut, 
  Globe, 
  Cpu, 
  Sparkles, 
  Check, 
  ShieldAlert, 
  Bell, 
  HelpCircle, 
  Shield, 
  Info,
  ChevronRight,
  Mic
} from 'lucide-react';
import { UserProfile, Language, TelemetryReading, SettingsSubPage, EmergencyContact } from '../types';
import { getBackendUrl } from '../services/api';
import { translations } from '../i18n/translations';
import { emergencyService } from '../services/emergencyService';

import { EmergencyContactsView } from './settings/EmergencyContactsView';
import { NotificationsView } from './settings/NotificationsView';
import { HelpSupportView } from './settings/HelpSupportView';
import { DataPrivacyView } from './settings/DataPrivacyView';
import { AboutView } from './settings/AboutView';
import { VoiceAssistantView } from './VoiceAssistantView';

interface SettingsProps {
  user: UserProfile | null;
  deviceId: string;
  readings: TelemetryReading[];
  language: Language;
  onLanguageChange: (lang: Language) => void;
  onSignOut: () => void;
  subPage?: SettingsSubPage;
  onSubPageChange?: (subPage: SettingsSubPage) => void;
}

export const SettingsView: React.FC<SettingsProps> = ({ 
  user, 
  deviceId, 
  readings,
  language,
  onLanguageChange,
  onSignOut,
  subPage: controlledSubPage,
  onSubPageChange
}) => {
  const [internalSubPage, setInternalSubPage] = useState<SettingsSubPage>('main');
  const [accentTheme, setAccentTheme] = useState<'gold' | 'silver'>('gold');
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const t = translations[language] || translations.en;

  const userIdentifier = user?.displayName || user?.email?.split('@')[0] || 'User';

  const logoutTexts = {
    rw: {
      loginsHeader: 'Kwinjira & Konti',
      logoutUser: `Sohoka muri ${userIdentifier}`,
      logoutAll: 'Sohoka muri konti zose',
      modalTitle: 'Ese urashaka gusohoka?',
      modalDesc: 'Ushobora kongera kwinjira muri konti yawe igihe cyose ubishakiye.',
      confirmLogout: 'Sohoka',
      cancel: 'Reka'
    },
    en: {
      loginsHeader: 'Logins',
      logoutUser: `Log out ${userIdentifier}`,
      logoutAll: 'Log out of all accounts',
      modalTitle: 'Log out of your account?',
      modalDesc: 'You can always log back in to SoberWatch at any time.',
      confirmLogout: 'Log Out',
      cancel: 'Cancel'
    },
    fr: {
      loginsHeader: 'Connexions',
      logoutUser: `Se déconnecter de ${userIdentifier}`,
      logoutAll: 'Se déconnecter de tous les comptes',
      modalTitle: 'Se déconnecter de votre compte ?',
      modalDesc: 'Vous pouvez vous reconnecter à tout moment.',
      confirmLogout: 'Se déconnecter',
      cancel: 'Annuler'
    },
    sw: {
      loginsHeader: 'Akaunti',
      logoutUser: `Ondoka kwenye ${userIdentifier}`,
      logoutAll: 'Ondoka kwenye akaunti zote',
      modalTitle: 'Je, ungependa kuondoka?',
      modalDesc: 'Unaweza kuingia tena wakati wowote.',
      confirmLogout: 'Ondoka',
      cancel: 'Ghairi'
    }
  }[language] || {
    loginsHeader: 'Logins',
    logoutUser: `Log out ${userIdentifier}`,
    logoutAll: 'Log out of all accounts',
    modalTitle: 'Log out of your account?',
    modalDesc: 'You can always log back in at any time.',
    confirmLogout: 'Log Out',
    cancel: 'Cancel'
  };

  const currentSubPage = controlledSubPage !== undefined ? controlledSubPage : internalSubPage;
  const setSubPage = (next: SettingsSubPage) => {
    if (onSubPageChange) {
      onSubPageChange(next);
    } else {
      setInternalSubPage(next);
    }
  };

  const languagesList: { code: Language; label: string; name: string }[] = [
    { code: 'rw', label: 'Kinyarwanda', name: 'Ikinyarwanda' },
    { code: 'en', label: 'English', name: 'English' },
    { code: 'fr', label: 'Français', name: 'Français' },
    { code: 'sw', label: 'Kiswahili', name: 'Kiswahili' },
  ];

  const primaryContact = emergencyService.getPrimaryContact();
  const secondaryContact = emergencyService.getSecondaryContact();
  const currentReading = readings.length > 0 ? readings[0] : null;

  if (currentSubPage === 'voice') {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setSubPage('main')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white text-xs font-mono transition"
        >
          ← {t.backToSettings || 'Back to Settings'}
        </button>
        <VoiceAssistantView
          currentLanguage={language}
          onLanguageChange={onLanguageChange}
          primaryContact={primaryContact}
          secondaryContact={secondaryContact}
          currentReading={currentReading}
          onNavigateToSettings={() => setSubPage('emergency')}
        />
      </div>
    );
  }

  if (currentSubPage === 'emergency') {
    return <EmergencyContactsView language={language} onBack={() => setSubPage('main')} />;
  }

  if (currentSubPage === 'notifications') {
    return <NotificationsView language={language} onBack={() => setSubPage('main')} />;
  }

  if (currentSubPage === 'support') {
    return <HelpSupportView language={language} onBack={() => setSubPage('main')} />;
  }

  if (currentSubPage === 'privacy') {
    return <DataPrivacyView readings={readings} language={language} onBack={() => setSubPage('main')} />;
  }

  if (currentSubPage === 'about') {
    return <AboutView language={language} onBack={() => setSubPage('main')} />;
  }

  const subPagesMenu: {
    id: SettingsSubPage;
    title: string;
    desc: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
  }[] = [
    {
      id: 'voice',
      title: t.voiceAssistantTitle || 'AI Voice Assistant',
      desc: t.voiceAssistantSubtitle || 'Kinyarwanda & Emergency Voice Commands',
      icon: Mic,
      badge: 'Kinyarwanda AI'
    },
    {
      id: 'emergency',
      title: t.emergencyContactsTitle,
      desc: t.emergencyContactsDesc,
      icon: ShieldAlert
    },
    {
      id: 'notifications',
      title: t.notificationsTitle,
      desc: t.notificationsDesc,
      icon: Bell
    },
    {
      id: 'support',
      title: t.helpSupportTitle,
      desc: t.helpSupportDesc,
      icon: HelpCircle
    },
    {
      id: 'privacy',
      title: t.dataPrivacyTitle,
      desc: t.dataPrivacyDesc,
      icon: Shield
    },
    {
      id: 'about',
      title: t.aboutTitle,
      desc: t.aboutDesc,
      icon: Info
    }
  ];

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-28 space-y-6">
      <div>
        <h2 className="font-luxury text-2xl font-bold text-white">
          {t.settingsTitle}
        </h2>
        <p className="text-xs text-white/50 font-mono mt-1">
          {t.settingsSubtitle}
        </p>
      </div>

      {/* User Profile Card */}
      <div className="rounded-[20px] bg-white/[0.05] backdrop-blur-[20px] border border-white/10 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full p-[2.5px] bg-gradient-to-tr from-[#D4AF37] via-amber-300 to-cyan-400 shrink-0 shadow-[0_0_15px_rgba(212,175,55,0.3)]">
              <div className="w-full h-full rounded-full overflow-hidden bg-black flex items-center justify-center">
                {user?.photoUrl ? (
                  <img 
                    src={user.photoUrl} 
                    alt={user.displayName || 'Profile'} 
                    className="w-full h-full object-cover" 
                  />
                ) : (
                  <span className="font-luxury font-bold text-lg text-[#D4AF37]">
                    {user?.displayName ? user.displayName.charAt(0).toUpperCase() : (user?.email ? user.email.charAt(0).toUpperCase() : 'U')}
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="font-luxury text-lg font-bold text-white">
                {user?.displayName || (user?.isGuest ? t.guestLogin : 'Patron')}
              </div>
              <div className="text-xs font-mono text-white/50">
                {user?.email || 'guest@soberwatch.io'}
              </div>
              <div className="text-[10px] font-mono text-white/30 mt-0.5">
                UID: {user?.uid || 'Unavailable'}
              </div>
            </div>
          </div>

          <button
            id="settings-signout-btn"
            onClick={() => setShowLogoutModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 text-white/80 hover:text-red-300 text-xs font-mono transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{t.signOut}</span>
          </button>
        </div>
      </div>

      {/* Settings Navigation Cards / Menu Items */}
      <div className="space-y-2.5">
        {subPagesMenu.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              id={`settings-menu-${item.id}`}
              onClick={() => setSubPage(item.id)}
              className="w-full rounded-[20px] bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 hover:border-[#D4AF37]/40 backdrop-blur-[20px] p-4 sm:p-5 flex items-center justify-between text-left transition cursor-pointer group"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-[#D4AF37] group-hover:bg-[#D4AF37]/20 transition">
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-luxury font-bold text-white text-base group-hover:text-[#D4AF37] transition">
                      {item.title}
                    </h3>
                    {item.badge && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/50 font-sans mt-0.5 max-w-lg">
                    {item.desc}
                  </p>
                </div>
              </div>

              <ChevronRight className="w-5 h-5 text-white/30 group-hover:text-[#D4AF37] group-hover:translate-x-0.5 transition shrink-0 ml-2" />
            </button>
          );
        })}
      </div>

      {/* Language Switcher Card */}
      <div className="rounded-[20px] bg-white/[0.05] backdrop-blur-[20px] border border-white/10 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-luxury text-base font-bold text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-[#D4AF37]" />
              <span>{t.language}</span>
            </h3>
            <p className="text-xs text-white/50 mt-0.5">
              {t.selectLanguage}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
          {languagesList.map((item) => (
            <button
              key={item.code}
              id={`settings-lang-${item.code}`}
              onClick={() => onLanguageChange(item.code)}
              className={`p-3 rounded-xl border flex items-center justify-between transition cursor-pointer ${
                language === item.code
                  ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-white'
                  : 'bg-white/[0.02] border-white/5 text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <div className="text-left">
                <div className="font-medium text-xs text-white">{item.label}</div>
                <div className="text-[10px] font-mono text-white/40">{item.name}</div>
              </div>
              {language === item.code && (
                <div className="w-5 h-5 rounded-full bg-[#D4AF37] text-black flex items-center justify-center">
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Device Info */}
      <div className="rounded-[20px] bg-white/[0.05] backdrop-blur-[20px] border border-white/10 p-6 space-y-4">
        <h3 className="font-luxury text-base font-bold text-white flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[#D4AF37]" />
          <span>{t.deviceInfo}</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
          <div className="p-3.5 rounded-[16px] bg-white/[0.02] border border-white/5">
            <div className="text-white/40 text-[10px]">{t.deviceId}</div>
            <div className="font-semibold text-white mt-1">{deviceId || 'Unavailable'}</div>
          </div>

          <div className="p-3.5 rounded-[16px] bg-white/[0.02] border border-white/5">
            <div className="text-white/40 text-[10px]">{t.backendUrl}</div>
            <div className="font-semibold text-white mt-1 truncate">{getBackendUrl()}</div>
          </div>

          <div className="p-3.5 rounded-[16px] bg-white/[0.02] border border-white/5">
            <div className="text-white/40 text-[10px]">{t.telemetryProtocol}</div>
            <div className="font-semibold text-emerald-400 mt-1">{t.realtimePolling}</div>
          </div>

          <div className="p-3.5 rounded-[16px] bg-white/[0.02] border border-white/5">
            <div className="text-white/40 text-[10px]">{t.firmwareIntegration}</div>
            <div className="font-semibold text-white mt-1">ESP32 REST Gateway</div>
          </div>
        </div>
      </div>

      {/* Theme Accent */}
      <div className="rounded-[20px] bg-white/[0.05] backdrop-blur-[20px] border border-white/10 p-6 flex items-center justify-between">
        <div>
          <h3 className="font-luxury text-base font-bold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#D4AF37]" />
            <span>{t.themeAccent}</span>
          </h3>
          <p className="text-xs text-white/50 mt-0.5">
            Black & Luxury Gold / White
          </p>
        </div>

        <div className="flex items-center gap-2 p-1 rounded-xl bg-white/5 border border-white/10">
          <button
            onClick={() => setAccentTheme('gold')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono transition cursor-pointer flex items-center gap-1.5 ${
              accentTheme === 'gold' 
                ? 'bg-[#D4AF37] text-black font-semibold' 
                : 'text-white/60 hover:text-white'
            }`}
          >
            {accentTheme === 'gold' && <Check className="w-3 h-3" />}
            <span>{t.gold}</span>
          </button>
          <button
            onClick={() => setAccentTheme('silver')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono transition cursor-pointer flex items-center gap-1.5 ${
              accentTheme === 'silver' 
                ? 'bg-white text-black font-semibold' 
                : 'text-white/60 hover:text-white'
            }`}
          >
            {accentTheme === 'silver' && <Check className="w-3 h-3" />}
            <span>{t.silver}</span>
          </button>
        </div>
      </div>

      {/* Instagram-Style Logins / Logout Section */}
      <div className="rounded-[20px] bg-white/[0.04] backdrop-blur-[20px] border border-white/10 p-4 sm:p-5 space-y-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-white/40 px-2 font-mono">
          {logoutTexts.loginsHeader}
        </div>

        <div className="space-y-1">
          <button
            id="instagram-logout-user-btn"
            onClick={() => setShowLogoutModal(true)}
            className="w-full p-3 rounded-xl hover:bg-red-500/10 text-left flex items-center justify-between text-red-400 hover:text-red-300 transition-colors font-medium text-sm cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <LogOut className="w-4 h-4 text-red-400 group-hover:scale-110 transition-transform" />
              <span>{logoutTexts.logoutUser}</span>
            </div>
            <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-red-400 transition" />
          </button>

          <button
            id="instagram-logout-all-btn"
            onClick={() => setShowLogoutModal(true)}
            className="w-full p-3 rounded-xl hover:bg-white/5 text-left flex items-center justify-between text-white/60 hover:text-white transition-colors font-medium text-sm cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <Shield className="w-4 h-4 text-white/40 group-hover:text-white transition" />
              <span>{logoutTexts.logoutAll}</span>
            </div>
            <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white transition" />
          </button>
        </div>
      </div>

      {/* Instagram-Style Logout Confirmation Modal */}
      <AnimatePresence>
        {showLogoutModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLogoutModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />

            {/* Modal Dialog */}
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 15 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="relative w-full max-w-sm rounded-[24px] bg-[#141416] border border-white/15 shadow-[0_20px_60px_rgba(0,0,0,0.9)] overflow-hidden text-center z-10"
            >
              <div className="p-6 pt-7 flex flex-col items-center">
                {/* User Avatar with glowing Instagram ring */}
                <div className="w-16 h-16 rounded-full p-[2.5px] bg-gradient-to-tr from-[#D4AF37] via-amber-300 to-cyan-400 mb-4 shadow-[0_0_20px_rgba(212,175,55,0.3)]">
                  <div className="w-full h-full rounded-full overflow-hidden bg-black flex items-center justify-center">
                    {user?.photoUrl ? (
                      <img 
                        src={user.photoUrl} 
                        alt={user.displayName || 'Profile'} 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <span className="font-luxury font-bold text-xl text-[#D4AF37]">
                        {user?.displayName ? user.displayName.charAt(0).toUpperCase() : (user?.email ? user.email.charAt(0).toUpperCase() : 'U')}
                      </span>
                    )}
                  </div>
                </div>

                <h3 className="font-luxury text-lg font-bold text-white tracking-wide">
                  {logoutTexts.modalTitle}
                </h3>
                <p className="text-xs text-white/50 mt-1.5 px-4 leading-relaxed">
                  {logoutTexts.modalDesc}
                </p>
              </div>

              {/* Instagram Dialog Action Buttons with Dividers */}
              <div className="border-t border-white/10 flex flex-col divide-y divide-white/10">
                <button
                  id="modal-confirm-logout-btn"
                  onClick={() => {
                    setShowLogoutModal(false);
                    onSignOut();
                  }}
                  className="w-full py-3.5 text-center text-red-500 font-bold text-sm hover:bg-red-500/10 active:bg-red-500/20 transition cursor-pointer"
                >
                  {logoutTexts.confirmLogout}
                </button>

                <button
                  id="modal-cancel-logout-btn"
                  onClick={() => setShowLogoutModal(false)}
                  className="w-full py-3.5 text-center text-white/80 hover:text-white font-medium text-sm hover:bg-white/5 active:bg-white/10 transition cursor-pointer"
                >
                  {logoutTexts.cancel}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
