import React from 'react';
import { motion } from 'motion/react';
import { ShieldAlert, AlertTriangle } from 'lucide-react';
import { emergencyService } from '../services/emergencyService';
import { Language } from '../types';
import { translations } from '../i18n/translations';

interface SOSButtonProps {
  language: Language;
  className?: string;
  size?: 'normal' | 'large' | 'compact';
}

export const SOSButton: React.FC<SOSButtonProps> = ({ 
  language, 
  className = '', 
  size = 'large' 
}) => {
  const t = translations[language] || translations.en;
  const config = emergencyService.getConfig();

  const handleTriggerSOS = () => {
    emergencyService.triggerEmergency('manual_sos', {
      customCountdown: config.sosCountdownSeconds || 10,
      notes: 'Emergency SOS activated by user',
    });
  };

  if (size === 'compact') {
    return (
      <button
        id="quick-sos-compact-btn"
        onClick={handleTriggerSOS}
        className={`px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-mono font-bold text-xs tracking-wider border border-red-400/50 shadow-[0_0_15px_rgba(239,68,68,0.4)] flex items-center gap-1.5 transition active:scale-95 cursor-pointer ${className}`}
      >
        <ShieldAlert className="w-3.5 h-3.5 text-white animate-pulse" />
        <span>SOS</span>
      </button>
    );
  }

  return (
    <motion.button
      id="main-sos-emergency-btn"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleTriggerSOS}
      className={`relative group w-full overflow-hidden rounded-[24px] bg-gradient-to-br from-red-600 via-red-700 to-red-950 p-6 sm:p-7 border-2 border-red-500 shadow-[0_0_40px_rgba(239,68,68,0.4)] text-left transition cursor-pointer ${className}`}
    >
      {/* Red ambient radial pulse */}
      <div className="absolute inset-0 bg-radial from-red-400/20 via-transparent to-transparent opacity-60 group-hover:opacity-100 transition" />
      
      <div className="relative z-10 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 sm:gap-5">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-black/40 border border-red-400/60 flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(239,68,68,0.5)]">
            <ShieldAlert className="w-8 h-8 sm:w-9 sm:h-9 text-red-100 animate-pulse" />
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-luxury text-xl sm:text-2xl font-black text-white tracking-wide">
                {t.sosButton}
              </span>
              {config.isTestMode && (
                <span className="px-2 py-0.5 rounded-full text-[9px] font-mono bg-[#D4AF37] text-black font-bold">
                  TEST MODE
                </span>
              )}
            </div>
            <p className="text-xs font-mono text-red-100/80 leading-relaxed max-w-md">
              {t.triggerSosPrompt}
            </p>
          </div>
        </div>

        <div className="hidden sm:flex flex-col items-end justify-center text-right shrink-0">
          <div className="px-3 py-1 rounded-xl bg-black/50 border border-red-400/40 text-[11px] font-mono text-red-200 font-bold flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-red-300" />
            <span>10s Countdown</span>
          </div>
          <span className="text-[10px] font-mono text-red-200/60 mt-1">Direct Calling</span>
        </div>
      </div>
    </motion.button>
  );
};
