import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, ShieldCheck, AlertTriangle, AlertOctagon, Brain } from 'lucide-react';
import { TelemetryReading, Language } from '../types';
import { translations } from '../i18n/translations';

interface AIInsightCardProps {
  currentReading: TelemetryReading | null;
  language: Language;
  isAnalyzing?: boolean;
}

export const AIInsightCard: React.FC<AIInsightCardProps> = ({
  currentReading,
  language,
  isAnalyzing = false
}) => {
  const t = translations[language] || translations.en;

  const status = currentReading?.status || 'SAFE';
  const bac = currentReading?.alcoholBac ?? 0;

  // Derive smart message based on real data
  let insightText = t.insightWaiting;
  let statusIcon = <Sparkles className="w-5 h-5 text-[#D4AF37]" />;
  let cardBorder = 'border-white/10';
  let badgeColor = 'text-[#D4AF37] bg-[#D4AF37]/10 border-[#D4AF37]/30';

  if (currentReading) {
    if (status === 'DANGER' || bac >= 0.08) {
      insightText = t.insightDanger;
      statusIcon = <AlertOctagon className="w-5 h-5 text-red-400" />;
      cardBorder = 'border-red-500/30';
      badgeColor = 'text-red-400 bg-red-950/40 border-red-500/30';
    } else if (status === 'CAUTION' || bac >= 0.02) {
      insightText = t.insightCaution;
      statusIcon = <AlertTriangle className="w-5 h-5 text-[#D4AF37]" />;
      cardBorder = 'border-[#D4AF37]/30';
      badgeColor = 'text-[#D4AF37] bg-amber-950/40 border-[#D4AF37]/30';
    } else {
      insightText = t.insightSafe;
      statusIcon = <ShieldCheck className="w-5 h-5 text-emerald-400" />;
      cardBorder = 'border-emerald-500/20';
      badgeColor = 'text-emerald-400 bg-emerald-950/40 border-emerald-500/30';
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`rounded-[20px] bg-white/[0.05] backdrop-blur-[20px] border ${cardBorder} p-5 sm:p-6 transition-all duration-300 relative overflow-hidden`}
    >
      {/* Subtle top indicator glow */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-white/5 border border-white/10">
            {statusIcon}
          </div>
          <div>
            <h3 className="font-luxury font-bold text-white text-base flex items-center gap-2">
              <span>{t.aiInsightTitle}</span>
              {isAnalyzing && (
                <span className="flex items-center gap-1 text-[10px] font-mono text-[#D4AF37] bg-[#D4AF37]/10 px-2 py-0.5 rounded-full border border-[#D4AF37]/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-ping" />
                  {t.analyzingTelemetry}
                </span>
              )}
            </h3>
            <span className="text-[10px] font-mono text-white/40 uppercase">
              Auto-Diagnostic Engine
            </span>
          </div>
        </div>

        {currentReading && (
          <span className={`px-3 py-1 rounded-full text-xs font-mono font-bold tracking-wider border ${badgeColor}`}>
            {status === 'DANGER' ? t.statusDanger : (status === 'CAUTION' ? t.statusCaution : t.statusSafe)}
          </span>
        )}
      </div>

      <div className="pt-2 text-sm text-white/90 leading-relaxed font-sans">
        <p className="border-l-2 border-[#D4AF37] pl-3 py-0.5">
          {insightText}
        </p>
      </div>
    </motion.div>
  );
};
