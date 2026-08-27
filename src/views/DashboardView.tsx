import React from 'react';
import { motion } from 'motion/react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid 
} from 'recharts';
import { Activity, Wifi, WifiOff } from 'lucide-react';
import { TelemetryReading, ReadingStatus, Language } from '../types';
import { translations } from '../i18n/translations';
import { AIInsightCard } from '../components/AIInsightCard';
import { SmartLoader } from '../components/SmartLoader';
import { SOSButton } from '../components/SOSButton';

interface DashboardProps {
  currentReading: TelemetryReading | null;
  readings: TelemetryReading[];
  language: Language;
  isLoading: boolean;
  isAnalyzing: boolean;
  onOpenVoice?: () => void;
}

export const DashboardView: React.FC<DashboardProps> = ({ 
  currentReading, 
  readings,
  language,
  isLoading,
  isAnalyzing,
}) => {
  const t = translations[language] || translations.en;

  const currentBac = currentReading?.alcoholBac ?? 0.0;
  const status: ReadingStatus = currentReading?.status ?? (currentBac >= 0.08 ? 'DANGER' : currentBac >= 0.02 ? 'CAUTION' : 'SAFE');
  const isConnected = !!currentReading;

  const statusColors = {
    SAFE: {
      text: 'text-emerald-400',
      badge: 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400',
      border: 'border-emerald-500/20'
    },
    CAUTION: {
      text: 'text-[#D4AF37]',
      badge: 'bg-amber-950/40 border-[#D4AF37]/30 text-[#D4AF37]',
      border: 'border-[#D4AF37]/20'
    },
    DANGER: {
      text: 'text-red-400',
      badge: 'bg-red-950/40 border-red-500/30 text-red-400',
      border: 'border-red-500/30'
    }
  }[status];

  // Last 20 real backend readings for the real-time line chart
  const chartData = [...readings].slice(0, 20).reverse().map((r) => {
    const d = new Date(r.timestamp);
    return {
      time: `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`,
      bac: r.alcoholBac,
      hr: r.heartRateBpm,
      raw: r.sensorRaw
    };
  });

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="rounded-[16px] bg-black/95 border border-white/15 p-3 backdrop-blur-[20px] font-mono text-xs space-y-1 shadow-[0_10px_25px_rgba(0,0,0,0.8)]">
          <div className="text-white/60">{label}</div>
          <div className="text-white font-bold text-sm">
            BrAC: <span className="text-[#D4AF37]">{data.bac.toFixed(3)}%</span>
          </div>
          {data.hr > 0 && <div className="text-white/60">{t.heartRate}: {data.hr} BPM</div>}
          {data.raw > 0 && <div className="text-white/40">{t.sensorRaw}: {data.raw}</div>}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-28 space-y-6">
      {/* Smart Loading AI Banner during initial loading */}
      {isLoading && readings.length === 0 && (
        <SmartLoader label={t.analyzingTelemetry} />
      )}

      {/* Current BrAC Large Glass Card */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className={`rounded-[20px] bg-white/[0.05] backdrop-blur-[20px] border border-white/10 p-6 sm:p-8 ${statusColors.border}`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="text-xs font-mono text-white/40 uppercase tracking-wider mb-1">
              {t.currentBrac}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-luxury text-6xl sm:text-7xl font-bold tracking-tight text-white">
                {currentReading ? currentReading.alcoholBac.toFixed(3) : '0.000'}
              </span>
              <span className="font-mono text-xl text-[#D4AF37] font-semibold">
                % BrAC
              </span>
            </div>
          </div>

          <div className="self-start sm:self-auto flex items-center gap-2">
            <span className={`px-4 py-1.5 rounded-full text-xs font-mono font-bold tracking-wider border ${statusColors.badge}`}>
              {status === 'DANGER' ? t.statusDanger : (status === 'CAUTION' ? t.statusCaution : t.statusSafe)}
            </span>
          </div>
        </div>

        {/* Real Data Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-white/10 text-xs font-mono">
          <div className="p-3 rounded-[16px] bg-white/[0.02] border border-white/5">
            <div className="text-white/40 text-[10px] uppercase">{t.deviceId}</div>
            <div className="text-white font-semibold text-sm mt-0.5 truncate">
              {currentReading?.deviceId || 'SW-001'}
            </div>
          </div>

          <div className="p-3 rounded-[16px] bg-white/[0.02] border border-white/5">
            <div className="text-white/40 text-[10px] uppercase">{t.sensorRaw}</div>
            <div className="text-white font-semibold text-sm mt-0.5">
              {currentReading ? currentReading.sensorRaw : '—'}
            </div>
          </div>

          <div className="p-3 rounded-[16px] bg-white/[0.02] border border-white/5">
            <div className="text-white/40 text-[10px] uppercase">{t.timestamp}</div>
            <div className="text-white font-semibold text-sm mt-0.5 truncate">
              {currentReading ? new Date(currentReading.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
            </div>
          </div>

          <div className="p-3 rounded-[16px] bg-white/[0.02] border border-white/5">
            <div className="text-white/40 text-[10px] uppercase">{t.connectionStatus}</div>
            <div className="flex items-center gap-1.5 text-sm mt-0.5 font-semibold truncate">
              {isConnected ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">{t.connected}</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-white/40" />
                  <span className="text-white/40">{t.disconnected}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* AI Insight Auto-Analysis Section */}
      <AIInsightCard
        currentReading={currentReading}
        language={language}
        isAnalyzing={isAnalyzing}
      />

      {/* SOS Emergency Quick Card */}
      <SOSButton language={language} size="large" />

      {/* Real-time Smooth Line Chart Card */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="rounded-[20px] bg-white/[0.05] backdrop-blur-[20px] border border-white/10 p-6 sm:p-8 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-luxury text-lg font-bold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#D4AF37]" />
            <span>{t.realTimeTelemetry}</span>
          </h2>
          <span className="text-xs font-mono text-[#D4AF37]">
            {chartData.length} {t.last20Readings}
          </span>
        </div>

        <div className="h-72 w-full">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="soberGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#D4AF37" stopOpacity={0.0} />
                  </linearGradient>
                </defs>

                <CartesianGrid 
                  strokeDasharray="3 3" 
                  stroke="rgba(212, 175, 55, 0.2)" 
                  vertical={false} 
                />

                <XAxis 
                  dataKey="time" 
                  stroke="rgba(255, 255, 255, 0.3)" 
                  fontSize={10} 
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(212, 175, 55, 0.2)' }}
                />

                <YAxis 
                  stroke="rgba(255, 255, 255, 0.3)" 
                  fontSize={10} 
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(212, 175, 55, 0.2)' }}
                  tickFormatter={(val) => `${val.toFixed(2)}%`}
                />

                <Tooltip content={<CustomTooltip />} />

                <Area 
                  type="monotone" 
                  dataKey="bac" 
                  stroke="#FFFFFF" 
                  strokeWidth={2.5} 
                  fillOpacity={1} 
                  fill="url(#soberGradient)" 
                  isAnimationActive={true}
                  animationDuration={500}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs font-mono text-white/40">
              {t.insightWaiting}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
