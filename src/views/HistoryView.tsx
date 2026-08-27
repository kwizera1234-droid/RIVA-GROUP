import React from 'react';
import { motion } from 'motion/react';
import { RotateCw, AlertCircle, Inbox, Cpu } from 'lucide-react';
import { TelemetryReading, Language } from '../types';
import { translations } from '../i18n/translations';

interface HistoryProps {
  readings: TelemetryReading[];
  language: Language;
  isLoading: boolean;
  onRefresh: () => void;
  error?: string | null;
}

export const HistoryView: React.FC<HistoryProps> = ({ 
  readings, 
  language,
  isLoading,
  onRefresh,
  error
}) => {
  const t = translations[language] || translations.en;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DANGER':
        return {
          label: t.statusDanger,
          cls: 'text-red-400 bg-red-950/40 border-red-500/40'
        };
      case 'CAUTION':
        return {
          label: t.statusCaution,
          cls: 'text-[#D4AF37] bg-amber-950/40 border-[#D4AF37]/30'
        };
      default:
        return {
          label: t.statusSafe,
          cls: 'text-emerald-400 bg-emerald-950/40 border-emerald-500/30'
        };
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-28 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-luxury text-2xl font-bold text-white">
            {t.historyTitle}
          </h2>
          <p className="text-xs text-white/50 font-mono mt-1">
            {readings.length} {t.recordedReadings}
          </p>
        </div>

        <button
          id="history-refresh-btn"
          onClick={onRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white text-xs font-mono transition cursor-pointer active:scale-95 disabled:opacity-50"
        >
          <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#D4AF37]' : ''}`} />
          <span>{t.refreshBtn}</span>
        </button>
      </div>

      {error && (
        <div className="rounded-[20px] bg-red-950/40 border border-red-500/30 p-4 flex items-center gap-3 text-red-300 text-xs font-mono">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{t.errorLoading}</span>
        </div>
      )}

      <div className="space-y-3">
        {isLoading && readings.length === 0 ? (
          <div className="rounded-[20px] bg-white/[0.05] border border-white/10 backdrop-blur-[20px] p-12 text-center text-xs font-mono text-white/50 flex flex-col items-center justify-center gap-3">
            <RotateCw className="w-6 h-6 animate-spin text-[#D4AF37]" />
            <span>{t.loadingHistory}</span>
          </div>
        ) : readings.length === 0 ? (
          <div className="rounded-[20px] bg-white/[0.05] border border-white/10 backdrop-blur-[20px] p-12 text-center space-y-3 flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40">
              <Inbox className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-luxury font-bold text-white text-base">
                {t.noReadings}
              </h3>
              <p className="text-xs font-mono text-white/40 max-w-sm mx-auto mt-1">
                {t.noReadingsDesc}
              </p>
            </div>
          </div>
        ) : (
          readings.map((reading, index) => {
            const date = new Date(reading.timestamp);
            const statusInfo = getStatusBadge(reading.status);

            return (
              <motion.div
                key={reading.id || `${reading.timestamp}-${index}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.02, 0.25) }}
                className="rounded-[20px] bg-white/[0.05] backdrop-blur-[20px] border border-white/10 p-4 sm:p-5 flex items-center justify-between gap-4 hover:border-[#D4AF37]/40 transition-colors"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-mono text-white/90 font-medium">
                      {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold border ${statusInfo.cls}`}>
                      {statusInfo.label}
                    </span>
                  </div>

                  <div className="text-[11px] font-mono text-white/40 flex flex-wrap items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Cpu className="w-3 h-3 text-[#D4AF37]" />
                      {reading.deviceId || 'SW-001'}
                    </span>
                    {reading.sensorRaw > 0 && <span>{t.sensorRaw}: {reading.sensorRaw}</span>}
                    {reading.heartRateBpm > 0 && <span>{t.heartRate}: {reading.heartRateBpm} BPM</span>}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="font-luxury text-2xl sm:text-3xl font-bold text-white">
                    {reading.alcoholBac.toFixed(3)}
                    <span className="text-xs font-mono text-[#D4AF37] ml-1">%</span>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
};
