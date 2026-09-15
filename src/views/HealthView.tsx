import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  AlertCircle,
  HeartPulse,
  RefreshCw,
  Thermometer,
  Wind,
  ShieldAlert,
  Sparkles,
  Database,
} from 'lucide-react';
import { TelemetryReading, Language, ReadingStatus } from '../types';
import { translations } from '../i18n/translations';
import { formatMetric } from '../utils/telemetry';

interface HealthViewProps {
  reading: TelemetryReading | null;
  readings: TelemetryReading[];
  language: Language;
  isLoading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

interface MetricDef {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}

const SkeletonBlock: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse bg-white/[0.06] border border-white/10 rounded-[20px] ${className}`}>
    <div className="h-full w-full rounded-[20px] p-5 flex flex-col justify-between">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/15" />
        <div className="space-y-1.5 flex-1">
          <div className="h-2.5 w-24 rounded bg-white/15" />
          <div className="h-2.5 w-16 rounded bg-white/10" />
        </div>
      </div>
      <div className="mt-6 h-8 w-28 rounded bg-white/10" />
      <div className="mt-3 h-2 w-20 rounded bg-white/[0.08]" />
    </div>
  </div>
);

export const HealthView: React.FC<HealthViewProps> = ({ reading, readings, language, isLoading, error, onRetry }) => {
  const t = translations[language] || translations.en;

  const status = reading?.status;
  const statusMeta = {
    SAFE: { text: 'text-emerald-300', badge: 'bg-emerald-950/50 border-emerald-500/30 text-emerald-300', label: t.statusSafe },
    CAUTION: { text: 'text-[#D4AF37]', badge: 'bg-amber-950/50 border-[#D4AF37]/30 text-[#D4AF37]', label: t.statusCaution },
    DANGER: { text: 'text-red-400', badge: 'bg-red-950/50 border-red-500/40 text-red-400', label: t.statusDanger },
  }[status as ReadingStatus] || { text: 'text-white/60', badge: 'bg-white/5 border-white/15 text-white/60', label: 'No status' };

  const history = useMemo(
    () => [...readings].filter((r) => r && typeof r.timestamp === 'number').sort((a, b) => b.timestamp - a.timestamp),
    [readings]
  );

  const hasRealData = Boolean(reading) && (
    reading?.heartRateBpm != null ||
    reading?.spo2Percent != null ||
    reading?.tempCelsius != null ||
    reading?.alcoholBac != null ||
    reading?.ecgStatus != null
  );

  const metrics: MetricDef[] = [
    {
      label: 'Heart Rate',
      value: formatMetric(reading?.heartRateBpm, ' BPM'),
      icon: HeartPulse,
      accent: 'text-rose-300',
    },
    {
      label: 'SpO₂',
      value: formatMetric(reading?.spo2Percent, '%'),
      icon: Wind,
      accent: 'text-cyan-300',
    },
    {
      label: 'Body Temperature',
      value: formatMetric(reading?.tempCelsius, '°C'),
      icon: Thermometer,
      accent: 'text-amber-300',
    },
    {
      label: 'BAC',
      value: reading && reading.alcoholBac != null ? `${reading.alcoholBac.toFixed(3)} %` : 'No data yet',
      icon: Activity,
      accent: 'text-[#D4AF37]',
    },
  ];

  if (isLoading && !hasRealData) {
    return (
      <section className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-28 space-y-6">
        <div>
          <h2 className="font-luxury text-2xl sm:text-3xl font-bold text-white">Health</h2>
          <p className="text-xs text-white/50 font-mono mt-1">Retrieving your latest health telemetry...</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} />)}
        </div>
        <div className="h-40 rounded-[20px] animate-pulse bg-white/[0.04] border border-white/10" />
      </section>
    );
  }

  return (
    <section className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-28 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#D4AF37]">
            {t.appName} • Biometric
          </div>
          <h2 className="font-luxury text-2xl sm:text-3xl font-bold text-white">Health</h2>
          <p className="text-xs text-white/50 font-mono mt-1">Latest health data from SoberWatch sensors</p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white text-xs font-mono transition cursor-pointer active:scale-95 disabled:opacity-50 self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#D4AF37]' : ''}`} />
            <span>Refresh</span>
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-[20px] bg-red-950/40 border border-red-500/30 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 text-red-300">
          <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5 text-red-400" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold font-mono text-red-200">Unable to load health data</div>
            <div className="text-xs font-mono text-red-300/70 mt-0.5">{error}</div>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-200 text-xs font-mono transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          )}
        </div>
      )}

      {!error && !hasRealData ? (
        <div className="rounded-[20px] bg-white/[0.04] border border-white/10 p-12 text-center space-y-3 flex flex-col items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40">
            <Database className="w-7 h-7" />
          </div>
          <div>
            <h3 className="font-luxury font-bold text-white text-base">No data available</h3>
            <p className="text-xs font-mono text-white/40 max-w-sm mx-auto mt-1">
              Your SoberWatch device has not sent any health readings yet. Readings will appear here once they are available.
            </p>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 border border-[#D4AF37]/30 text-[#D4AF37] text-xs font-mono transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          )}
        </div>
      ) : hasRealData ? (
        <>
          {/* Health status hero card */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className={`rounded-[20px] bg-white/[0.05] backdrop-blur-[20px] border border-white/10 p-5 sm:p-6 ${reading?.status === 'DANGER' ? 'border-red-500/40' : ''}`}
          >
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shrink-0 ${reading?.status === 'DANGER' ? 'bg-red-500/15 border border-red-500/40' : 'bg-[#D4AF37]/15 border border-[#D4AF37]/40'}`}>
                  {reading?.status === 'DANGER'
                    ? <ShieldAlert className="w-5 h-5 text-red-400" />
                    : <Sparkles className="w-5 h-5 text-[#D4AF37]" />}
                </div>
                <div>
                  <div className="text-[10px] uppercase font-mono text-white/40 tracking-wider">Health Status</div>
                  <span className={`inline-block mt-1 px-3 py-1 rounded-full text-xs font-mono font-bold tracking-wider border ${statusMeta.badge}`}>
                    {statusMeta.label}
                  </span>
                </div>
              </div>
              <div className="text-right text-[11px] font-mono text-white/50">
                <div>Last updated</div>
                <div className="text-white/80 mt-0.5">
                  {reading?.timestamp ? new Date(reading.timestamp).toLocaleString() : 'No data yet'}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Health metrics grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {metrics.map(({ label, value, icon: Icon, accent }, index) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
                className="rounded-[20px] bg-white/[0.05] border border-white/10 backdrop-blur-[20px] p-5 flex flex-col justify-between hover:border-[#D4AF37]/30 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                    <Icon className={`w-4.5 h-4.5 ${accent}`} />
                  </div>
                  <div className="text-[10px] uppercase font-mono text-white/40 leading-tight">{label}</div>
                </div>
                <div className="mt-6 text-xl sm:text-2xl font-semibold text-white truncate">{value}</div>
                <div className="mt-2 text-[10px] font-mono text-white/35">SoW {label}</div>
              </motion.div>
            ))}
          </div>

          {/* Fall detection + ECG + activity card */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.35 }}
            className="rounded-[20px] bg-white/[0.04] border border-white/10 backdrop-blur-[20px] p-5 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-5"
          >
            <div className="space-y-4">
              <div>
                <div className="text-[10px] uppercase font-mono text-white/40 tracking-wider">ECG / Heart Activity</div>
                <div className="text-sm font-semibold text-white mt-1">{reading?.ecgStatus || 'Sensor not connected'}</div>
                <div className="text-[11px] font-mono text-white/40 mt-0.5">Sensor raw: {formatMetric(reading?.sensorRaw)} · Response: {formatMetric(reading?.sensorResponse)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-mono text-white/40 tracking-wider">Device</div>
                <div className="text-sm font-semibold text-[#D4AF37] mt-1 truncate">{reading?.deviceId || 'Sensor not connected'}</div>
                <div className="text-[11px] font-mono text-white/40 mt-0.5">Source: {reading?.source || 'Not available'}</div>
              </div>
            </div>
            <div className="space-y-4 md:border-l md:border-white/10 md:pl-5">
              <div>
                <div className="text-[10px] uppercase font-mono text-white/40 tracking-wider">Fall Detection</div>
                <div className="text-sm font-semibold text-white mt-1">Monitoring active</div>
                <div className="text-[11px] font-mono text-white/40 mt-0.5">Automatic SOS on detected fall</div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-mono text-white/40 tracking-wider">Historical Readings</div>
                <div className="text-sm font-semibold text-white mt-1">{history.length} readings</div>
                {history.length > 0 && (
                  <div className="text-[11px] font-mono text-white/40 mt-0.5">
                    Oldest {new Date(history[history.length - 1].timestamp).toLocaleDateString()} · Latest {new Date(history[0].timestamp).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Recent readings timeline */}
          {history.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.35 }}
              className="rounded-[20px] bg-white/[0.04] border border-white/10 backdrop-blur-[20px] p-5 sm:p-6 space-y-3"
            >
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#D4AF37]" />
                <h3 className="font-luxury font-bold text-white text-sm">Health Trends</h3>
              </div>
              <div className="space-y-2">
                {history.slice(0, 8).map((item, index) => {
                  const date = new Date(item.timestamp);
                  return (
                    <div key={item.id || `${item.timestamp}-${index}`} className="flex items-center justify-between gap-3 rounded-[14px] bg-white/[0.02] border border-white/5 px-3.5 py-2.5 text-xs font-mono">
                      <div className="text-white/70">{date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      <div className="flex gap-3 text-white/50 flex-wrap justify-end">
                        <span>HR {formatMetric(item.heartRateBpm, ' BPM')}</span>
                        <span>SpO₂ {formatMetric(item.spo2Percent, '%')}</span>
                        <span>Temp {formatMetric(item.tempCelsius, '°C')}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </>
      ) : null}
    </section>
  );
};
