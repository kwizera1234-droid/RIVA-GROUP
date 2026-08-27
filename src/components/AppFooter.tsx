import React from 'react';
import { 
  ShieldCheck, 
  ExternalLink, 
  Globe,
  Radio,
  Phone
} from 'lucide-react';
import { SoberWatchLogo } from './SoberWatchLogo';
import { ActiveScreen, Language, SettingsSubPage } from '../types';
import { translations } from '../i18n/translations';
import { getBackendUrl } from '../services/api';

interface AppFooterProps {
  currentScreen: ActiveScreen;
  language: Language;
  onNavigate: (screen: ActiveScreen) => void;
  onSelectSubPage: (subPage: SettingsSubPage) => void;
  onLanguageChange: (lang: Language) => void;
}

export const AppFooter: React.FC<AppFooterProps> = ({
  language,
  onNavigate,
  onSelectSubPage,
  onLanguageChange
}) => {
  const t = translations[language] || translations.en;
  const backendUrl = getBackendUrl();

  const handleSubPageClick = (sub: SettingsSubPage) => {
    onSelectSubPage(sub);
    onNavigate('settings');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const languagesList: { code: Language; label: string; name: string }[] = [
    { code: 'rw', label: 'RW', name: 'Kinyarwanda' },
    { code: 'en', label: 'EN', name: 'English' },
    { code: 'fr', label: 'FR', name: 'Français' },
    { code: 'sw', label: 'SW', name: 'Kiswahili' },
  ];

  return (
    <footer 
      id="main-app-footer" 
      className="w-full bg-[#08090E]/95 backdrop-blur-2xl border-t border-white/10 pt-6 pb-20 sm:pb-24 mt-12 transition-all"
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-4">
        
        {/* Top Header: Brand Name & Biometrics Active + Emergency Numbers */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-white/10">
          {/* Brand + Biometrics Active Badge */}
          <div className="flex items-center gap-3">
            <div className="p-1 rounded-xl bg-white/5 border border-white/10">
              <SoberWatchLogo size={26} variant="original" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-luxury font-bold text-base text-white tracking-wider">
                {t.appName}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium tracking-wide bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Biometrics Active
              </span>
            </div>
          </div>

          {/* Quick Direct Emergency Hotlines */}
          <div className="flex items-center gap-2.5">
            <a
              id="footer-quick-112"
              href="tel:112"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 hover:text-white transition-all text-xs font-mono font-semibold cursor-pointer shadow-sm"
              title="Call 112 Police Emergency"
            >
              <Phone className="w-3.5 h-3.5 text-red-400" />
              <span>112 (Police)</span>
            </a>
            
            <a
              id="footer-quick-912"
              href="tel:912"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 hover:text-white transition-all text-xs font-mono font-semibold cursor-pointer shadow-sm"
              title="Call 912 SAMU Medical Emergency"
            >
              <Radio className="w-3.5 h-3.5 text-amber-400" />
              <span>912 (SAMU)</span>
            </a>
          </div>
        </div>

        {/* Middle / Lower Row: Languages & Privacy + Cloud API + Copyright */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-1 text-xs font-mono text-white/50">
          
          {/* Language Selector Chips */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/40 border border-white/10">
            <Globe className="w-3.5 h-3.5 text-white/40 ml-1 mr-0.5" />
            {languagesList.map((lang) => {
              const isSelected = language === lang.code;
              return (
                <button
                  key={lang.code}
                  id={`footer-lang-${lang.code}`}
                  onClick={() => onLanguageChange(lang.code)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
                    isSelected
                      ? 'bg-[#D4AF37] text-black shadow-[0_0_12px_rgba(212,175,55,0.4)]'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                  title={lang.name}
                >
                  {lang.label}
                </button>
              );
            })}
          </div>

          {/* Links: Data Privacy & Exports • Cloud API • © 2026 SoberWatch */}
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-xs">
            <button
              id="footer-bottom-privacy-btn"
              onClick={() => handleSubPageClick('privacy')}
              className="hover:text-white text-white/70 transition cursor-pointer flex items-center gap-1.5"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Data Privacy & Exports</span>
            </button>

            <span className="text-white/20">•</span>

            <a
              id="footer-backend-api-link"
              href={`${backendUrl}/api/telemetry/health`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#D4AF37] text-white/70 transition cursor-pointer flex items-center gap-1"
            >
              <span>Cloud API</span>
              <ExternalLink className="w-3 h-3 text-[#D4AF37]" />
            </a>

            <span className="text-white/20">•</span>

            <span className="text-white/50 font-medium">
              © 2026 SoberWatch
            </span>
          </div>

        </div>

      </div>
    </footer>
  );
};

