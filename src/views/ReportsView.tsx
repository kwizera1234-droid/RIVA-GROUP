import React, { useMemo, useState } from 'react';
import { Activity, AlertCircle, BarChart3, Brain, CalendarDays, CheckCircle2, Database, Download, Gauge, HeartPulse, Share2, ShieldCheck, Thermometer, X } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { Language, TelemetryReading } from '../types';
import { translations } from '../i18n/translations';
import { LoadingState } from '../components/LoadingState';
import { calculateReport, ReportSummary } from '../services/reportEngine';
import { formatBac } from '../utils/telemetry';

interface ReportsProps { readings: TelemetryReading[]; healthReading?: TelemetryReading | null; language: Language; isLoading: boolean; error?: string | null; }
type ReportRange = 'today' | '7d' | '30d' | 'custom';
type MetricStats = { latest: number | null; average: number | null; min: number | null; max: number | null };

const stats = (readings: TelemetryReading[], key: keyof TelemetryReading): MetricStats => {
  const values = readings.map((reading) => reading[key]).filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
  return {
    latest: values.at(-1) ?? null,
    average: values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : null,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
  };
};

const show = (number: number | null, suffix = '') => number === null ? 'Not available' : `${number.toFixed(number < 10 ? 3 : 1)}${suffix}`;

const Metric: React.FC<{ title: string; icon: React.ReactNode; data: MetricStats; suffix?: string }> = ({ title, icon, data, suffix = '' }) => (
  <article className="rounded-[20px] border border-white/10 bg-white/[0.05] p-4 space-y-3">
    <div className="flex items-center gap-2 text-xs font-mono uppercase text-white/55">{icon}{title}</div>
    <div className="text-2xl font-semibold text-white">{show(data.latest, suffix)}</div>
    <div className="grid grid-cols-3 gap-2 text-[11px] font-mono text-white/45">
      <span>Avg {show(data.average, suffix)}</span>
      <span>Min {show(data.min, suffix)}</span>
      <span>Max {show(data.max, suffix)}</span>
    </div>
  </article>
);

const buildReportFilename = (range: ReportRange, start?: Date, end?: Date) => {
  const date = new Date();
  const stamp = date.toISOString().slice(0, 10);
  if (range === 'today') return `SoberWatch-Daily-Report-${stamp}.pdf`;
  if (range === '7d') return `SoberWatch-Weekly-Report-${stamp}.pdf`;
  if (range === '30d') return `SoberWatch-Monthly-Report-${date.toISOString().slice(0, 7)}.pdf`;
  if (start && end) return `SoberWatch-Report-${start.toISOString().slice(0, 10)}-to-${end.toISOString().slice(0, 10)}.pdf`;
  return `SoberWatch-Report-${stamp}.pdf`;
};

export const ReportsView: React.FC<ReportsProps> = ({ readings, healthReading, language, isLoading, error }) => {
  const t = translations[language] || translations.en;
  const [range, setRange] = useState<ReportRange>('7d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const now = Date.now();

  const bounds = useMemo(() => {
    if (range === 'today') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return { start: start.getTime(), end: now + 1 };
    }
    if (range === '30d') return { start: now - 30 * 86400000, end: now + 1 };
    if (range === 'custom' && customStart) {
      return {
        start: new Date(`${customStart}T00:00:00`).getTime(),
        end: customEnd ? new Date(`${customEnd}T23:59:59`).getTime() : now + 1,
      };
    }
    return { start: now - 7 * 86400000, end: now + 1 };
  }, [range, customStart, customEnd, now]);

  const report: ReportSummary = useMemo(() => calculateReport(readings, bounds.start, bounds.end), [readings, bounds]);
  const ordered = useMemo(() => [...report.readings].sort((a, b) => a.timestamp - b.timestamp), [report.readings]);
  const bac = stats(ordered, 'alcoholBac');
  const heart = stats(ordered, 'heartRateBpm');
  const spo2 = stats(ordered, 'spo2Percent');
  const temperature = stats(ordered, 'tempCelsius');
  const latest = healthReading || ordered.at(-1);
  const ranges = { today: t.reportToday || 'Today', '7d': t.reportLast7Days || 'Last 7 Days', '30d': t.reportLast30Days || 'Last 30 Days', custom: t.reportCustomRange || 'Custom Range' };

  const shareSummary = useMemo(() => {
    if (report.readings.length === 0) return 'SoberWatch report is ready: no measurements available for this period.';
    const avg = report.averageBac !== null ? report.averageBac.toFixed(3) : 'N/A';
    const statusSummary = report.danger > 0 ? `${report.danger} danger readings` : `${report.safe} safe readings`;
    return `SoberWatch ${ranges[range]} report: average BAC ${avg}%, ${statusSummary}. Safety score ${report.score ?? 'N/A'}/100.`;
  }, [report, range, ranges]);

  const downloadPdf = () => {
    try {
      const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
      const margin = 40;
      const pageWidth = pdf.internal.pageSize.getWidth();
      let y = 60;

      pdf.setFillColor(12, 13, 17);
      pdf.rect(0, 0, pageWidth, 120, 'F');
      pdf.setTextColor(212, 175, 55);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(22);
      pdf.text('SOBERWATCH', margin, 42);

      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(18);
      pdf.text(`${ranges[range]} Report`, margin, 72);
      pdf.setFontSize(10);
      pdf.setTextColor(200, 200, 200);
      pdf.text(`Generated: ${new Date().toLocaleString()}`, margin, 92);

      y = 150;
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(11);
      const execSummary = [
        `Overall safety: ${report.score === null ? 'Not available' : `${report.score}/100`}`,
        `Reading count: ${report.readings.length}`,
        `Average BAC: ${report.averageBac !== null ? report.averageBac.toFixed(3) : 'N/A'}%`,
        `Safe: ${report.safe} · Caution: ${report.caution} · Danger: ${report.danger}`,
      ];
      execSummary.forEach((line) => {
        pdf.text(line, margin, y);
        y += 18;
      });

      y += 10;
      pdf.setTextColor(212, 175, 55);
      pdf.setFontSize(12);
      pdf.text('Behavior Analysis', margin, y);
      y += 18;
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(10);
      const analysis = report.recommendations.length > 0 ? report.recommendations.map((item) => item.observation).slice(0, 3) : ['No recommendation data available.'];
      analysis.forEach((line) => {
        const wrapped = pdf.splitTextToSize(line, pageWidth - margin * 2);
        pdf.text(wrapped, margin, y);
        y += wrapped.length * 14 + 8;
      });

      y += 8;
      pdf.setTextColor(212, 175, 55);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Key Metrics', margin, y);
      y += 18;
      const metricData = [
        ['Metric', 'Value'],
        ['Average BAC', report.averageBac !== null ? `${report.averageBac.toFixed(3)}%` : 'N/A'],
        ['Highest BAC', report.highestBac !== null ? `${report.highestBac.toFixed(3)}%` : 'N/A'],
        ['Lowest BAC', report.lowestBac !== null ? `${report.lowestBac.toFixed(3)}%` : 'N/A'],
        ['Average HR', report.averageHeartRate !== null ? `${report.averageHeartRate.toFixed(1)} BPM` : 'N/A'],
        ['Average SpO2', report.averageSpo2 !== null ? `${report.averageSpo2.toFixed(1)}%` : 'N/A'],
        ['Average Temp', report.averageTemperature !== null ? `${report.averageTemperature.toFixed(1)}°C` : 'N/A'],
      ];
      const colWidths = [150, 120];
      metricData.forEach((row, index) => {
        const x = margin;
        row.forEach((cell, cellIndex) => {
          const width = colWidths[cellIndex];
          pdf.setFillColor(index === 0 ? 212 : 26, index === 0 ? 175 : 27, index === 0 ? 55 : 31);
          pdf.setTextColor(index === 0 ? 0 : 255, index === 0 ? 0 : 255, index === 0 ? 0 : 255);
          pdf.rect(x + (cellIndex * 150), y + (index * 16) - 12, width, 16, 'F');
          pdf.setTextColor(index === 0 ? 0 : 255, index === 0 ? 0 : 255, index === 0 ? 0 : 255);
          pdf.text(cell, x + (cellIndex * 150) + 8, y + (index * 16) - 1);
        });
      });

      const tableY = y + metricData.length * 18 + 16;
      pdf.setTextColor(212, 175, 55);
      pdf.text('Recent Readings', margin, tableY);
      pdf.setTextColor(255, 255, 255);
      let rowY = tableY + 16;
      ordered.slice(0, 8).forEach((reading) => {
        const dataLine = `${new Date(reading.timestamp).toLocaleDateString()} | ${Number(reading.alcoholBac || 0).toFixed(3)}% | ${reading.status}`;
        pdf.text(dataLine, margin, rowY);
        rowY += 14;
      });

      const filename = buildReportFilename(range, customStart ? new Date(`${customStart}T00:00:00`) : undefined, customEnd ? new Date(`${customEnd}T23:59:59`) : undefined);
      pdf.save(filename);
    } catch (error) {
      console.error('Report PDF generation failed:', error);
      const message = error instanceof Error ? error.message : 'Unknown PDF generation error';
      window.alert(`Report download failed: ${message}`);
    }
  };

  const handleShare = async () => {
    const shareText = `${shareSummary}\n\nGenerated on ${new Date().toLocaleString()}`;
    const url = window.location.origin || 'https://soberwatch.app';

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'SoberWatch Report',
          text: shareText,
          url,
        });
        setShareOpen(false);
        return;
      } catch {
        // fall through to manual options
      }
    }

    const target = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    window.open(target, '_blank', 'noopener,noreferrer');
    setShareOpen(false);
  };

  const SharePlatformButton = ({ label, href, accent, children }: { label: string; href: string; accent: string; children: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-center text-white/80 transition hover:border-white/20 hover:bg-white/[0.06]"
      style={{ boxShadow: accent ? `0 0 0 1px ${accent}30 inset` : undefined }}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: accent }}>{children}</div>
      <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-white/75">{label}</span>
    </a>
  );

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href || 'https://soberwatch.app');
      setShareOpen(false);
    } catch {
      setShareOpen(false);
    }
  };

  if (isLoading && readings.length === 0) return <section className="max-w-6xl mx-auto px-4 py-8"><LoadingState label={t.loadingReport || 'Loading report...'} /></section>;

  return (
    <section className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 pb-28 space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#D4AF37]">SoberWatch Intelligence</div>
          <h2 className="font-luxury text-3xl font-bold text-white">Reports</h2>
          <p className="text-sm text-white/50">Measured safety and wellness patterns</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShareOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-2 text-xs font-mono uppercase tracking-[0.18em] text-[#D4AF37] transition hover:bg-[#D4AF37]/15 cursor-pointer">
            <Share2 className="w-4 h-4" />
            Share Report
          </button>
          <button onClick={downloadPdf} className="inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-3 py-2 text-xs font-mono uppercase tracking-[0.18em] text-black transition hover:brightness-110 cursor-pointer">
            <Download className="w-4 h-4" />
            Download Report
          </button>
        </div>
      </header>

      {error && <div className="rounded-[18px] border border-red-500/30 bg-red-950/30 p-4 flex gap-3 text-xs text-red-200"><AlertCircle className="w-5 h-5" />{error}</div>}

      <div className="rounded-[22px] border border-[#D4AF37]/20 bg-black/30 p-4">
        <div className="flex items-center gap-3">
          <CalendarDays className="w-5 h-5 text-[#D4AF37]" />
          <div className="flex gap-2 overflow-x-auto">
            {(Object.keys(ranges) as ReportRange[]).map((item) => (
              <button
                key={item}
                onClick={() => setRange(item)}
                className={`px-3 py-2 rounded-xl border text-xs font-mono whitespace-nowrap ${range === item ? 'bg-[#D4AF37] text-black border-[#D4AF37]' : 'bg-white/5 text-white/65 border-white/10'}`}
              >
                {ranges[item]}
              </button>
            ))}
          </div>
        </div>
        {range === 'custom' && (
          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <input aria-label="Start date" type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} className="rounded-lg bg-white/10 border border-white/10 px-2 py-2 text-xs text-white" />
            <input aria-label="End date" type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} className="rounded-lg bg-white/10 border border-white/10 px-2 py-2 text-xs text-white" />
          </div>
        )}
      </div>

      <div className="text-xs font-mono text-white/40">{new Date(bounds.start).toLocaleDateString()} - {new Date(bounds.end).toLocaleDateString()} · {report.readings.length} readings</div>

      {report.readings.length === 0 ? (
        <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-12 text-center">
          <Database className="w-10 h-10 text-[#D4AF37] mx-auto mb-3" />
          <h3 className="text-white font-semibold">Not enough recorded data</h3>
          <p className="text-sm text-white/50 mt-2">Record more telemetry to generate a report for this period.</p>
        </div>
      ) : (
        <>
          <div className="grid lg:grid-cols-[1.2fr_2fr] gap-4">
            <article className="rounded-[22px] border border-[#D4AF37]/30 bg-gradient-to-br from-[#D4AF37]/15 to-white/[0.03] p-6">
              <div className="flex gap-2 text-[#D4AF37] font-semibold"><Gauge className="w-5 h-5" />Overall Safety Score</div>
              <div className="text-5xl font-luxury text-white mt-4">{report.score === null ? 'Not available' : `${report.score}/100`}</div>
              <p className="text-xs text-white/50 mt-4">Based on measured status, BAC, health observations, and data coverage. This is not a medical diagnosis.</p>
              <div className="mt-4 space-y-1 text-xs text-white/65">
                {report.scoreFactors.map((factor) => <div key={factor}>• {factor}</div>)}
                {report.positiveFactors.map((factor) => <div key={factor} className="text-emerald-300">+ {factor}</div>)}
              </div>
            </article>

            <article className="rounded-[22px] border border-white/10 bg-white/[0.04] p-6">
              <div className="flex gap-2 text-white font-semibold"><Brain className="w-5 h-5 text-[#D4AF37]" />Executive Summary</div>
              <p className="text-sm text-white/75 mt-4">
                {report.safePeriods} lower-risk readings and {report.riskPeriods} elevated-risk readings were recorded. {report.trend === 'up' ? 'BAC moved upward.' : report.trend === 'down' ? 'BAC moved downward.' : 'BAC remained broadly stable or needs more data.'}
              </p>
              <div className="mt-4 text-sm text-white">Latest: {formatBac(bac.latest)} · Trend: {report.trend}</div>
            </article>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Metric title="BAC" icon={<Activity className="w-4 h-4 text-[#D4AF37]" />} data={bac} suffix=" %" />
            <Metric title="Heart Rate" icon={<HeartPulse className="w-4 h-4 text-rose-300" />} data={heart} suffix=" BPM" />
            <Metric title="SpO₂" icon={<ShieldCheck className="w-4 h-4 text-cyan-300" />} data={spo2} suffix=" %" />
            <Metric title="Temperature" icon={<Thermometer className="w-4 h-4 text-amber-300" />} data={temperature} suffix=" °C" />
          </div>

          <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
            <article className="rounded-[22px] border border-white/10 bg-white/[0.04] p-5">
              <div className="flex gap-2 text-white font-semibold"><BarChart3 className="w-4 h-4 text-[#D4AF37]" />Historical Trends</div>
              <div className="mt-5 h-48 flex items-end gap-1 border-b border-white/10">
                {ordered.map((reading) => {
                  const readingBac = typeof reading.alcoholBac === 'number' ? reading.alcoholBac : 0;
                  return (
                    <div
                      key={`${reading.id || reading.timestamp}-${reading.timestamp}`}
                      title={`${formatBac(reading.alcoholBac)} · ${new Date(reading.timestamp).toLocaleString()}`}
                      className={`flex-1 min-w-[3px] rounded-t-sm ${reading.status === 'DANGER' ? 'bg-red-400' : reading.status === 'CAUTION' ? 'bg-amber-300' : 'bg-emerald-400'}`}
                      style={{ height: `${Math.min(100, Math.max(4, readingBac * 900))}%` }}
                    />
                  );
                })}
              </div>
            </article>

            <article className="rounded-[22px] border border-white/10 bg-white/[0.04] p-5 space-y-3">
              <div className="flex gap-2 text-white font-semibold"><Database className="w-4 h-4 text-[#D4AF37]" />Data Quality & Device</div>
              <div className="text-sm text-white/70">Readings: <strong className="text-white">{report.readings.length}</strong></div>
              <div className="text-sm text-white/70">Device: <strong className="text-white">{report.devices.length ? report.devices.join(', ') : 'Not available'}</strong></div>
              <div className="text-sm text-white/70">Coverage: <strong className="text-white">{show(report.dataQuality, '%')}</strong></div>
              <div className="text-xs text-white/40">{latest?.source || 'Sensor source not available'}</div>
            </article>
          </div>

          <article className="rounded-[22px] border border-white/10 bg-white/[0.04] p-5">
            <div className="flex gap-2 text-white font-semibold"><CheckCircle2 className="w-4 h-4 text-emerald-300" />Recommendations</div>
            <div className="grid md:grid-cols-2 gap-3 mt-4">
              {report.recommendations.map((item) => (
                <div key={item.observation} className="border-l-2 border-[#D4AF37] pl-3 text-xs space-y-1">
                  <div className="font-semibold text-white">{item.observation}</div>
                  <div className="text-white/55"><strong>Why:</strong> {item.why}</div>
                  <div className="text-white/70"><strong>Action:</strong> {item.action}</div>
                  <div className="uppercase text-[10px] text-[#D4AF37]">Priority: {item.priority}</div>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[22px] border border-[#D4AF37]/20 bg-[#D4AF37]/[0.05] p-5">
            <div className="text-[#D4AF37] font-semibold">Behavior Analysis</div>
            <p className="text-sm text-white/70 mt-3">
              {report.trend === 'up' ? 'Measurements increased over the selected period, which suggests higher variability and a need for closer monitoring.' : report.trend === 'down' ? 'Recent readings show a declining pattern compared with the beginning of the period.' : 'Recent readings remain relatively steady and do not show a strong directional trend.'}
            </p>
            <p className="text-sm text-white/70 mt-2">
              {report.safePeriods >= report.riskPeriods ? 'The majority of observations stayed within the lower-risk range.' : 'A meaningful share of recent readings landed in elevated-risk zones and warrant attention.'}
            </p>
          </article>
        </>
      )}

      {shareOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center">
          <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#0a0b10]/95 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.75)]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#D4AF37]">Share Report</div>
                <h3 className="font-luxury text-2xl text-white">Share</h3>
              </div>
              <button onClick={() => setShareOpen(false)} className="rounded-full border border-white/10 bg-white/[0.03] p-2 text-white/70 transition hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-sm">
              <SharePlatformButton label="WhatsApp" href={`https://wa.me/?text=${encodeURIComponent(shareSummary)}`} accent="#25D366">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 text-white">
                  <path fill="currentColor" d="M12 2C6.49 2 2 6.32 2 11.66c0 2.15.7 4.14 1.89 5.75L3 22l4.88-1.63A9.67 9.67 0 0 0 12 21.35c5.51 0 10-4.32 10-9.69S17.51 2 12 2Zm5.12 13.41c-.18.48-.96.9-1.26 1-.31.09-.72.13-1.08-.09-.31-.18-.94-.65-1.7-1.13-.64-.47-1.06-.7-1.42-.75-.28-.05-.63.09-.98.52-.36.42-1.12 1.33-1.34 1.6-.22.28-.43.29-.78.1-.35-.19-1.47-.64-2.8-1.7-1.03-.9-1.73-2.02-1.93-2.36-.2-.34-.02-.53.15-.71.15-.15.34-.39.51-.58.17-.19.23-.33.35-.55.12-.22.06-.42-.03-.58-.09-.17-.82-1.96-1.13-2.67-.29-.69-.59-.6-.82-.6H7c-.28 0-.74.11-1.12.53C5.53 7.34 4.8 8.08 4.8 9.7c0 1.61.82 2.66 1.14 3.07.31.41 1.64 2.66 3.95 4.03 2.31 1.37 2.31 1.17 2.73 1.1.42-.06 1.36-.55 1.55-1.09s.19-.99.13-1.08Z"/>
                </svg>
              </SharePlatformButton>
              <SharePlatformButton label="Email" href={`mailto:?subject=${encodeURIComponent('SoberWatch Report')}&body=${encodeURIComponent(shareSummary)}`} accent="#d4af37">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 text-black">
                  <path fill="currentColor" d="M3 6.75A2.75 2.75 0 0 1 5.75 4h12.5A2.75 2.75 0 0 1 21 6.75v10.5A2.75 2.75 0 0 1 18.25 20H5.75A2.75 2.75 0 0 1 3 17.25V6.75Zm2.1-.5 6.9 5.2 6.9-5.2H5.1Zm13.15 2.03-6.12 4.6a1 1 0 0 1-1.26 0L5.75 8.28v8.97c0 .41.34.75.75.75h10.99a.75.75 0 0 0 .75-.75V8.28Z"/>
                </svg>
              </SharePlatformButton>
              <SharePlatformButton label="X" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareSummary)}`} accent="#111111">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 text-white">
                  <path fill="currentColor" d="M18.9 2h3.67l-8.03 9.19L22.8 22h-7.26l-5.68-8.32L3.34 22H-.33l8.6-9.84L1.2 2h7.43l5.13 7.54L18.9 2Zm-1.28 18h2.02L7.08 3.9H4.96L17.62 20Z"/>
                </svg>
              </SharePlatformButton>
              <button onClick={copyLink} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-center text-white/80">Copy Link</button>
              <button onClick={handleShare} className="rounded-2xl border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-3 text-center text-[#D4AF37]">More...</button>
              <button onClick={() => setShareOpen(false)} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-center text-white/80">Close</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
