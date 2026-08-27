import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertOctagon, X } from 'lucide-react';
import { TelemetryReading, Language } from '../types';
import { translations } from '../i18n/translations';

interface BannerProps {
  reading: TelemetryReading | null;
  language: Language;
  onDismiss?: () => void;
}

export const DangerNotificationBanner: React.FC<BannerProps> = ({ 
  reading, 
  language,
  onDismiss 
}) => {
  if (!reading || reading.status !== 'DANGER') return null;
  const t = translations[language] || translations.en;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="w-full max-w-5xl mx-auto px-4 sm:px-6 pt-4"
      >
        <div className="rounded-[20px] bg-red-950/80 border border-red-500/50 backdrop-blur-[20px] p-4 flex items-center justify-between gap-3 shadow-[0_0_30px_rgba(239,68,68,0.3)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center shrink-0">
              <AlertOctagon className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-luxury font-bold text-red-200 text-base">
                  {t.dangerAlertTitle}
                </span>
                <span className="text-xs font-mono font-bold text-red-300 bg-red-900/50 px-2 py-0.5 rounded-full">
                  {reading.alcoholBac.toFixed(3)}% BrAC
                </span>
              </div>
              <p className="text-xs text-red-200/90 mt-0.5">
                {t.dangerAlertMsg}
              </p>
            </div>
          </div>

          {onDismiss && (
            <button
              onClick={onDismiss}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
