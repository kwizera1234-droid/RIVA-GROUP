import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Activity, AlertTriangle, HeartPulse, Wifi, WifiOff, ShieldCheck, Gauge, TrendingUp, Sparkles } from 'lucide-react';
import { TelemetryReading, ReadingStatus, Language } from '../types';
import { translations } from '../i18n/translations';
import { AIInsightCard } from '../components/AIInsightCard';
import { SmartLoader } from '../components/SmartLoader';

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

  const currentBac = currentReading?.alcoholBac;
  const status: ReadingStatus | undefined = currentReading?.status;
  const isConnected = !!currentReading;

  const statusColors = {
    SAFE: {
      text: 'text-emerald-300',
      chip: 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300',
      accent: '#34d399',
      fill: 'rgba(52, 211, 153, 0.25)',
    },
    CAUTION: {
      text: 'text-[#D4AF37]',
      chip: 'bg-[#D4AF37]/15 border-[#D4AF37]/30 text-[#D4AF37]',
      accent: '#D4AF37',
      fill: 'rgba(212, 175, 55, 0.2)',
    },
    DANGER: {
      text: 'text-red-300',
      chip: 'bg-red-500/15 border-red-400/30 text-red-300',
      accent: '#f87171',
      fill: 'rgba(248, 113, 113, 0.2)',
    },
  }[status || 'SAFE'];

  const chartData = useMemo(
    () => [...readings].slice(0, 20).reverse().map((r) => {
      const d = new Date(r.timestamp);
      return {
        time: `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`,
        bac: Number(r.alcoholBac ?? 0),
        hr: Number(r.heartRateBpm ?? 0),
        spo2: Number(r.spo2Percent ?? 0),
        temp: Number(r.tempCelsius ?? 0),
      };
    }),
    [readings]
  );

  const safetyDistribution = useMemo(() => {
    const counts = { SAFE: 0, CAUTION: 0, DANGER: 0 } as Record<ReadingStatus, number>;
    readings.forEach((reading) => {
      counts[reading.status] += 1;
    });
    return [
      { name: 'Safe', value: counts.SAFE, color: '#34d399' },
      { name: 'Caution', value: counts.CAUTION, color: '#D4AF37' },
      { name: 'Danger', value: counts.DANGER, color: '#f87171' },
    ].filter((item) => item.value > 0);
  }, [readings]);

  const healthTrendData = useMemo(() => {
    const valid = [...readings].filter((r) => r.heartRateBpm || r.spo2Percent || r.tempCelsius);
    return valid.slice(0, 12).reverse().map((r) => ({
      time: new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      heartRate: r.heartRateBpm || 0,
      spo2: r.spo2Percent || 0,
      temp: r.tempCelsius || 0,
    }));
  }, [readings]);

  const behaviorInsight = useMemo(() => {
    if (readings.length === 0) return 'No measurements available yet.';
    const recent = readings.slice(0, 5);
    const safeCount = recent.filter((r) => r.status === 'SAFE').length;
    const cautionCount = recent.filter((r) => r.status === 'CAUTION').length;
    const dangerCount = recent.filter((r) => r.status === 'DANGER').length;

    if (dangerCount > 0) return 'Needs Attention: recent readings include elevated-risk measurements.';
    if (cautionCount > 0 && safeCount >= cautionCount) return 'Observed Pattern: mostly stable with occasional caution-level readings.';
    if (safeCount >= 3) return 'Improving: recent measurements show a consistent lower-risk profile.';
    return 'Stable: recent measurements remain broadly consistent.';
  }, [readings]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="rounded-[16px] bg-black/95 border border-white/15 p-3 backdrop-blur-[20px] text-xs space-y-1 shadow-[0_10px_25px_rgba(0,0,0,0.8)]">
          <div className="text-white/60">{label}</div>
          <div className="text-white font-bold text-sm">
            BrAC: <span className="text-[#D4AF37]">{Number(data.bac || 0).toFixed(3)}%</span>
          </div>
          {data.hr > 0 && <div className="text-white/60">HR: {data.hr} BPM</div>}
          {data.spo2 > 0 && <div className="text-white/60">SpO₂: {data.spo2}%</div>}
        </div>
      );
    }
    return null;
  };

  if (isLoading && readings.length === 0) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-28 space-y-6">
        <SmartLoader label={t.analyzingTelemetry} />
      </div>
    );
  }

  if (!currentReading) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-12 pb-28 text-center">
        <Database className="mx-auto w-10 h-10 text-white/30" />
        <h2 className="mt-4 text-lg font-semibold text-white">No backend telemetry available</h2>
        <p className="mt-2 text-sm text-white/50">The server has not returned a verified reading for this account.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-28 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="rounded-[28px] border border-white/10 bg-[radial-gradient(120%_120%_at_50%_0%,rgba(212,175,55,0.18),rgba(8,9,12,0.85)_60%)] p-5 sm:p-7 shadow-[0_20px_80px_rgba(0,0,0,0.45)]"
      >
        <div className="grid lg:grid-cols-[1.3fr_0.7fr] gap-5">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.35em] text-[#D4AF37]">SOBERWATCH</div>
            <h1 className="mt-3 font-luxury text-4xl sm:text-5xl leading-tight text-white">Measure Alcohol. Understand the Risk. Choose Safety.</h1>
            <p className="mt-4 max-w-xl text-sm sm:text-base text-white/70">
              SoberWatch is a smart safety and health platform that helps people understand alcohol-related risk, monitor health data, recognize behavioral patterns, and make safer decisions.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-mono font-medium ${statusColors.chip}`}>
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: statusColors.accent }} />
                {status === 'DANGER' ? t.statusDanger : status === 'CAUTION' ? t.statusCaution : t.statusSafe}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-white/60">
                <Wifi className="w-3.5 h-3.5 text-emerald-300" />
                {isConnected ? t.connected : t.disconnected}
              </span>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-black/20 p-4 sm:p-5 backdrop-blur-[18px]">
            <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-white/45">Current BrAC</div>
            <div className="mt-3 flex items-end gap-2">
              <span className="font-luxury text-5xl sm:text-6xl font-bold leading-none text-white">{currentBac.toFixed(3)}</span>
              <span className="pb-2 text-base font-mono text-[#D4AF37]">%</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-xs font-mono text-white/60">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-white/40 uppercase">Device</div>
                <div className="mt-1 text-white">{currentReading.deviceId}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-white/40 uppercase">Time</div>
                <div className="mt-1 text-white">{currentReading ? new Date(currentReading.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <AIInsightCard currentReading={currentReading} language={language} isAnalyzing={isAnalyzing} />
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.4 }}
        className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4 sm:p-5"
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-[#D4AF37]" />
            <h2 className="font-luxury text-xl text-white">Live Safety Status</h2>
          </div>
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-white/40">Updated live</div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Heart Rate', value: `${currentReading.heartRateBpm} BPM`, icon: HeartPulse, tone: 'rose' },
            { label: 'SpO₂', value: `${currentReading.spo2Percent}%`, icon: ShieldCheck, tone: 'cyan' },
            { label: 'Temperature', value: `${currentReading.tempCelsius}°C`, icon: Activity, tone: 'amber' },
            { label: 'Status', value: status, icon: AlertTriangle, tone: 'gold' },
          ].map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="rounded-[20px] border border-white/10 bg-black/10 p-4">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                  <Icon className={`h-4 w-4 ${tone === 'rose' ? 'text-rose-300' : tone === 'cyan' ? 'text-cyan-300' : tone === 'amber' ? 'text-amber-300' : 'text-[#D4AF37]'}`} />
                </div>
                <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/40">{label}</span>
              </div>
              <div className="mt-4 text-lg font-semibold text-white">{value}</div>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.4 }}
        className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4 sm:p-5"
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#D4AF37]" />
            <h2 className="font-luxury text-xl text-white">Behavior Insight</h2>
          </div>
          <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-white/40">Observed Pattern</span>
        </div>
        <p className="text-sm text-white/70 max-w-2xl">{behaviorInsight}</p>
      </motion.div>

      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.4 }}
          className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4 sm:p-5"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#D4AF37]" />
              <h2 className="font-luxury text-xl text-white">Analytics</h2>
            </div>
            <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-white/40">Alcohol / Reading Trend</span>
          </div>

          {chartData.length > 0 ? (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 12, right: 10, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashboardTrendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#D4AF37" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="time" stroke="rgba(255,255,255,0.45)" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgba(255,255,255,0.45)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${v.toFixed(2)}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="bac" stroke="#D4AF37" strokeWidth={2.4} fill="url(#dashboardTrendGradient)" isAnimationActive animationDuration={600} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-52 items-center justify-center rounded-[20px] border border-dashed border-white/10 bg-black/10 text-sm text-white/45">No measurements available for this period.</div>
          )}
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4 sm:p-5"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#D4AF37]" />
                <h3 className="font-luxury text-xl text-white">Safety Behavior</h3>
              </div>
            </div>
            {safetyDistribution.length > 0 ? (
              <div className="grid grid-cols-[1fr_1.2fr] gap-3 items-center">
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={safetyDistribution} dataKey="value" nameKey="name" innerRadius={32} outerRadius={52} paddingAngle={4}>
                        {safetyDistribution.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  {safetyDistribution.map((entry) => (
                    <div key={entry.name} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/10 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                        <span className="text-sm text-white/75">{entry.name}</span>
                      </div>
                      <span className="text-sm font-semibold text-white">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex h-40 items-center justify-center rounded-[20px] border border-dashed border-white/10 bg-black/10 text-sm text-white/45">No safety counts available.</div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.24, duration: 0.4 }}
            className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4 sm:p-5"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HeartPulse className="w-4 h-4 text-[#D4AF37]" />
                <h3 className="font-luxury text-xl text-white">Health Trend</h3>
              </div>
            </div>
            {healthTrendData.length > 0 ? (
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={healthTrendData} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="time" stroke="rgba(255,255,255,0.45)" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="rgba(255,255,255,0.45)" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="heartRate" stroke="#f87171" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="spo2" stroke="#38bdf8" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="temp" stroke="#D4AF37" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-52 items-center justify-center rounded-[20px] border border-dashed border-white/10 bg-black/10 text-sm text-white/45">Health readings not available for this device.</div>
            )}
          </motion.div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28, duration: 0.4 }}
        className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4 sm:p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#D4AF37]" />
            <h2 className="font-luxury text-xl text-white">Recent Activity</h2>
          </div>
        </div>

        {readings.length > 0 ? (
          <div className="space-y-2">
            {readings.slice(0, 6).map((reading) => (
              <div key={reading.id || reading.timestamp} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-2xl border border-white/10 bg-black/10 px-3 py-3">
                <div>
                  <div className="text-xs font-mono uppercase tracking-[0.2em] text-white/40">{new Date(reading.timestamp).toLocaleString()}</div>
                  <div className="mt-1 text-sm text-white/80">BAC {Number(reading.alcoholBac || 0).toFixed(3)}% · HR {reading.heartRateBpm || 0} BPM</div>
                </div>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.18em] ${
                  reading.status === 'DANGER' ? 'border-red-400/30 bg-red-500/10 text-red-300' :
                  reading.status === 'CAUTION' ? 'border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#D4AF37]' :
                  'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
                }`}>
                  {reading.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center rounded-[20px] border border-dashed border-white/10 bg-black/10 text-sm text-white/45">No activity to display yet.</div>
        )}
      </motion.div>
    </div>
  );
};
