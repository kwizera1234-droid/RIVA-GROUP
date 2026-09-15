import React from 'react';
import { motion } from 'motion/react';
import { AlertOctagon, ShieldCheck, AlertTriangle, Cpu, BellOff } from 'lucide-react';
import { TelemetryReading, Language } from '../types';
import { translations } from '../i18n/translations';

interface AlertsProps {
  currentReading: TelemetryReading | null;
  readings: TelemetryReading[];
  language: Language;
}

export const AlertsView: React.FC<AlertsProps> = ({ 
  currentReading, 
  readings,
  language 
}) => {
  const t = translations[language] || translations.en;

  const isCurrentDanger = currentReading?.status === 'DANGER';

  // Filter alert history ONLY from actual backend readings whose status was DANGER
  const dangerHistory = readings.filter((r) => r.status === 'DANGER');

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-28 space-y-6">
      <div>
        <h2 className="font-luxury text-2xl font-bold text-white">
          {t.alertsTitle}
        </h2>
        <p className="text-xs text-white/50 font-mono mt-1">
          {t.alertsSubtitle}
        </p>
      </div>

      {/* Section 1: Current Alert State */}
      <div>
        {isCurrentDanger && currentReading ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-[20px] bg-red-950/80 border border-red-500/50 backdrop-blur-[24px] p-6 shadow-[0_0_35px_rgba(239,68,68,0.3)] space-y-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center shrink-0">
                  <AlertOctagon className="w-6 h-6 text-red-400 animate-pulse" />
                </div>
                <div>
                  <h3 className="font-luxury font-bold text-red-200 text-lg tracking-wide">
                    {t.activeDangerAlert}
                  </h3>
                  <div className="text-xs font-mono text-red-300/80 mt-0.5 flex items-center gap-2">
                    <span>{t.deviceId}: {currentReading.deviceId}</span>
                    <span>•</span>
                    <span>{new Date(currentReading.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <span className="font-luxury text-3xl sm:text-4xl font-bold text-red-100">
                  {currentReading.alcoholBac.toFixed(3)}
                </span>
                <span className="text-xs font-mono text-red-300 ml-1">% BrAC</span>
              </div>
            </div>

            <div className="pt-3 border-t border-red-500/30 text-xs text-red-200 leading-relaxed">
              <p className="font-medium">
                {t.activeDangerDesc}
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[20px] bg-white/[0.04] border border-white/10 backdrop-blur-[20px] p-6 flex flex-col sm:flex-row items-center sm:items-start gap-4"
          >
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <div className="text-center sm:text-left space-y-1">
              <h3 className="font-luxury font-bold text-white text-base">
                {t.allClearTitle}
              </h3>
              <p className="text-xs text-white/50 font-sans max-w-xl">
                {t.allClearMsg}
              </p>
              {currentReading && (
                <div className="text-[11px] font-mono text-[#D4AF37] pt-1">
                  {t.currentBrac}: {currentReading.alcoholBac.toFixed(3)}% BrAC ({currentReading.status})
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>

      {/* Section 2: Alert History (Generated ONLY from actual backend readings with DANGER status) */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <h3 className="font-luxury text-lg font-bold text-white flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#D4AF37]" />
            <span>{t.alertHistoryTitle}</span>
          </h3>
          <span className="text-xs font-mono text-white/40">
            {dangerHistory.length} {t.recordedReadings}
          </span>
        </div>

        <div className="space-y-3">
          {dangerHistory.length === 0 ? (
            <div className="rounded-[20px] bg-white/[0.04] border border-white/10 backdrop-blur-[20px] p-8 text-center space-y-2 flex flex-col items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40">
                <BellOff className="w-5 h-5" />
              </div>
              <div>
                <div className="font-luxury font-bold text-white text-sm">
                  {t.noAlertsRecorded}
                </div>
                <p className="text-xs font-mono text-white/40 max-w-sm mx-auto mt-0.5">
                  {t.noAlertsRecordedDesc}
                </p>
              </div>
            </div>
          ) : (
            dangerHistory.map((alertItem, idx) => {
              const alertDate = new Date(alertItem.timestamp);
              return (
                <motion.div
                  key={alertItem.id || `danger-${alertItem.timestamp}-${idx}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                  className="rounded-[20px] bg-red-950/30 border border-red-500/30 backdrop-blur-[20px] p-4 sm:p-5 flex items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-red-200 font-medium">
                        {alertDate.toLocaleDateString()} {alertDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-red-500/20 border border-red-500/40 text-red-300">
                        {t.statusDanger}
                      </span>
                    </div>

                    <div className="text-[11px] font-mono text-white/40 flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Cpu className="w-3 h-3 text-red-400" />
                        {alertItem.deviceId}
                      </span>
                      {alertItem.sensorRaw > 0 && <span>{t.sensorRaw}: {alertItem.sensorRaw}</span>}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-luxury text-2xl font-bold text-red-300">
                      {alertItem.alcoholBac.toFixed(3)}
                      <span className="text-xs font-mono text-red-400 ml-1">%</span>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
