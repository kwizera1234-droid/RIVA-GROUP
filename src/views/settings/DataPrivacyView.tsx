import React, { useState } from 'react';
import { ChevronLeft, Download, Trash2, Shield, Check, AlertCircle, FileText } from 'lucide-react';
import { TelemetryReading, Language } from '../../types';
import { translations } from '../../i18n/translations';

interface DataPrivacyProps {
  readings: TelemetryReading[];
  language: Language;
  onBack: () => void;
}

export const DataPrivacyView: React.FC<DataPrivacyProps> = ({ readings, language, onBack }) => {
  const t = translations[language] || translations.en;

  const [isExporting, setIsExporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleExportJSON = () => {
    try {
      setIsExporting(true);
      const dataStr = JSON.stringify(readings, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `soberwatch_telemetry_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setStatusMessage({ type: 'success', text: t.downloadSuccess });
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (e) {
      setStatusMessage({ type: 'error', text: 'Export error' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCSV = () => {
    try {
      setIsExporting(true);
      const headers = ['Timestamp,Date,Time,BrAC,Status,HeartRateBpm,SensorRaw,DeviceId'];
      const rows = readings.map((r) => {
        const d = new Date(r.timestamp);
        return [
          r.timestamp,
          `"${d.toLocaleDateString()}"`,
          `"${d.toLocaleTimeString()}"`,
          r.alcoholBac,
          r.status,
          r.heartRateBpm,
          r.sensorRaw,
          `"${r.deviceId || 'SW-001'}"`
        ].join(',');
      });

      const csvContent = [headers.join('\n'), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `soberwatch_telemetry_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatusMessage({ type: 'success', text: t.downloadSuccess });
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (e) {
      setStatusMessage({ type: 'error', text: 'Export error' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleClearLocalCache = () => {
    setIsClearing(true);
    setTimeout(() => {
      // Clear non-critical offline cached metadata
      localStorage.removeItem('soberwatch_notif_prefs');
      setIsClearing(false);
      setStatusMessage({ type: 'success', text: t.clearedSuccess });
      setTimeout(() => setStatusMessage(null), 3000);
    }, 400);
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-28 space-y-6">
      <div className="flex items-center justify-between">
        <button
          id="privacy-back-btn"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-mono text-white/60 hover:text-white transition cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>{t.backToSettings}</span>
        </button>
      </div>

      <div>
        <h2 className="font-luxury text-2xl font-bold text-white flex items-center gap-2.5">
          <Shield className="w-6 h-6 text-[#D4AF37]" />
          <span>{t.dataPrivacyTitle}</span>
        </h2>
        <p className="text-xs text-white/50 font-mono mt-1">
          {t.dataPrivacyDesc}
        </p>
      </div>

      {statusMessage && (
        <div
          className={`p-4 rounded-xl border text-xs font-mono flex items-center gap-2 ${
            statusMessage.type === 'success'
              ? 'bg-[#D4AF37]/15 border-[#D4AF37]/40 text-[#D4AF37]'
              : 'bg-red-950/40 border-red-500/40 text-red-300'
          }`}
        >
          {statusMessage.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Export Telemetry Records */}
      <div className="rounded-[20px] bg-white/[0.05] border border-white/10 backdrop-blur-[20px] p-6 space-y-4">
        <div>
          <h3 className="font-luxury font-bold text-white text-base flex items-center gap-2">
            <Download className="w-4 h-4 text-[#D4AF37]" />
            <span>{t.downloadData}</span>
          </h3>
          <p className="text-xs text-white/50 mt-0.5">
            {t.downloadDataDesc} ({readings.length} {t.recordedReadings})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            id="export-json-btn"
            onClick={handleExportJSON}
            disabled={isExporting || readings.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-white text-xs font-mono transition cursor-pointer disabled:opacity-40"
          >
            <FileText className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>{t.exportJson}</span>
          </button>

          <button
            id="export-csv-btn"
            onClick={handleExportCSV}
            disabled={isExporting || readings.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#c49f2f] text-black text-xs font-mono font-bold transition cursor-pointer disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t.exportCsv}</span>
          </button>
        </div>
      </div>

      {/* Clear Local Cache */}
      <div className="rounded-[20px] bg-white/[0.05] border border-white/10 backdrop-blur-[20px] p-6 space-y-4">
        <div>
          <h3 className="font-luxury font-bold text-white text-base flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-red-400" />
            <span>{t.clearCache}</span>
          </h3>
          <p className="text-xs text-white/50 mt-0.5">
            {t.clearCacheDesc}
          </p>
        </div>

        <button
          id="clear-cache-btn"
          onClick={handleClearLocalCache}
          disabled={isClearing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-500/30 text-red-300 text-xs font-mono transition cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>{isClearing ? 'Clearing...' : t.clearBtn}</span>
        </button>
      </div>

      {/* Privacy Policy & Encryption Notice */}
      <div className="rounded-[20px] bg-white/[0.03] border border-white/10 backdrop-blur-[20px] p-6 space-y-2">
        <h3 className="font-luxury font-bold text-white text-sm">
          {t.privacyInfoTitle}
        </h3>
        <p className="text-xs text-white/60 font-sans leading-relaxed">
          {t.privacyInfoBody}
        </p>
      </div>
    </div>
  );
};
