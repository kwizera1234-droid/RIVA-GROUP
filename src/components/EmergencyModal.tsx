import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AlertOctagon, 
  PhoneCall, 
  XCircle, 
  MapPin, 
  Navigation, 
  ShieldAlert, 
  ExternalLink,
  Cpu,
  FlaskConical,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { EmergencyState, EmergencyEventRecord, Language } from '../types';
import { emergencyService } from '../services/emergencyService';
import { translations } from '../i18n/translations';

interface EmergencyModalProps {
  language: Language;
  uid?: string;
}

export const EmergencyModal: React.FC<EmergencyModalProps> = ({ language }) => {
  const [state, setState] = useState<EmergencyState>(emergencyService.getState());
  const [event, setEvent] = useState<EmergencyEventRecord | null>(emergencyService.getCurrentEvent());
  const [secondsRemaining, setSecondsRemaining] = useState<number>(emergencyService.getSecondsRemaining());
  const config = emergencyService.getConfig();
  const t = translations[language] || translations.en;

  useEffect(() => {
    const unsubscribe = emergencyService.subscribe((nextState, nextEvent, nextSec) => {
      setState(nextState);
      setEvent(nextEvent);
      setSecondsRemaining(nextSec);
    });
    return () => unsubscribe();
  }, []);

  if (state === 'NORMAL') {
    return null;
  }

  const isCountdown = state === 'COUNTDOWN' || state === 'EMERGENCY_DETECTED';
  const isCalling = state === 'CALL_CONTACT' || state === 'GET_LOCATION' || state === 'LOG_EVENT' || state === 'CONFIRMED_EMERGENCY';
  const isCancelled = state === 'CANCELLED';

  const totalSeconds = event?.type === 'manual_sos' 
    ? config.sosCountdownSeconds 
    : config.autoCountdownSeconds;
  const progressPercent = totalSeconds > 0 ? (secondsRemaining / totalSeconds) * 100 : 0;

  const targetName = event?.contactName || config.primaryContact?.name || 'Emergency Services (112)';
  const targetPhone = event?.contactPhone || config.primaryContact?.phone || config.emergencyServiceNumber || '112';

  const formatEventType = (type?: string) => {
    switch (type) {
      case 'crash': return 'Severe Vehicle Collision Detected';
      case 'fall': return 'Sudden Fall & Ground Impact';
      case 'manual_sos': return 'Emergency SOS Trigger';
      case 'critical_health': return 'Critical Biometric Threshold';
      case 'soberband': return 'SoberBand Hardware Emergency Signal';
      default: return 'Emergency Signal Triggered';
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        id="emergency-modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/90 backdrop-blur-xl overflow-y-auto"
      >
        <motion.div
          id="emergency-modal-container"
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          className="relative w-full max-w-lg rounded-[28px] bg-black/95 border-2 border-red-500/80 shadow-[0_0_80px_rgba(239,68,68,0.45)] p-6 sm:p-8 space-y-6 text-center overflow-hidden"
        >
          {/* Ambient red pulsating background glow */}
          <div className="absolute -top-32 -left-32 w-64 h-64 bg-red-600/30 rounded-full blur-[90px] pointer-events-none animate-pulse" />
          <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-red-600/30 rounded-full blur-[90px] pointer-events-none animate-pulse" />

          {/* Test Mode Top Ribbon */}
          {config.isTestMode && (
            <div className="inline-flex items-center gap-1.5 px-4 py-1 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/50 text-[#D4AF37] text-xs font-mono font-bold tracking-wide">
              <FlaskConical className="w-3.5 h-3.5" />
              <span>{t.testModeBadge}</span>
            </div>
          )}

          {/* Header Icon & Title */}
          <div className="space-y-2">
            <div className="mx-auto w-20 h-20 rounded-full bg-red-500/20 border-2 border-red-500/60 flex items-center justify-center shadow-[0_0_30px_rgba(239,68,68,0.5)]">
              {isCancelled ? (
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              ) : isCalling ? (
                <PhoneCall className="w-10 h-10 text-red-400 animate-bounce" />
              ) : (
                <AlertOctagon className="w-10 h-10 text-red-500 animate-pulse" />
              )}
            </div>

            <h2 className="font-luxury text-2xl sm:text-3xl font-bold text-white tracking-wide">
              {isCancelled ? 'EMERGENCY CANCELLED' : t.sosActiveTitle}
            </h2>

            <p className="text-xs font-mono text-red-300/80 max-w-md mx-auto">
              {event?.notes || formatEventType(event?.type)}
            </p>
          </div>

          {/* Countdown Display */}
          {isCountdown && (
            <div className="space-y-4 py-2">
              <div className="relative w-36 h-36 mx-auto flex items-center justify-center">
                {/* Circular SVG Progress */}
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    className="stroke-red-950/60"
                    strokeWidth="8"
                    fill="transparent"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    className="stroke-red-500 transition-all duration-300"
                    strokeWidth="8"
                    strokeDasharray="264"
                    strokeDashoffset={264 - (264 * progressPercent) / 100}
                    strokeLinecap="round"
                    fill="transparent"
                  />
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-luxury text-5xl font-black text-white tracking-tight">
                    {secondsRemaining}
                  </span>
                  <span className="text-[10px] font-mono text-red-300 uppercase tracking-wider">
                    seconds
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-red-950/60 border border-red-500/40 text-xs font-mono text-red-200">
                <span className="font-semibold text-white">
                  Emergency call starting in {secondsRemaining} seconds.
                </span>
                <div className="text-[11px] text-red-300/70 mt-0.5">
                  Calling <strong className="text-white">{targetName}</strong> ({targetPhone}) automatically.
                </div>
                <div className="text-[11px] text-amber-300 font-semibold mt-1.5 flex items-center justify-center gap-1.5">
                  <span>🎙️ Voice Stop: Vuga &quot;Hagarika&quot; cyangwa &quot;Cancel&quot; guhagarika</span>
                </div>
              </div>
            </div>
          )}

          {/* Active Call / Dispatched Status */}
          {isCalling && (
            <div className="p-4 rounded-2xl bg-red-950/70 border border-red-500/50 space-y-3 text-left font-mono text-xs text-red-200">
              <div className="flex items-center justify-between">
                <span className="text-white/60">Call Status:</span>
                <span className="px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-300 font-bold">
                  {event?.callStatus === 'simulated' ? 'SIMULATED (TEST)' : event?.callStatus === 'success' ? 'CONNECTED / ACTIVE' : 'CALLING...'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-white/60">Contact:</span>
                <span className="text-white font-semibold">{targetName}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-white/60">Phone:</span>
                <span className="text-[#D4AF37] font-bold">{targetPhone}</span>
              </div>

              {event?.callMode && (
                <div className="flex items-center justify-between text-[11px] text-white/50">
                  <span>Protocol:</span>
                  <span className="text-white/80">{event.callMode}</span>
                </div>
              )}
            </div>
          )}

          {/* GPS Coordinates Badge */}
          <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 text-xs font-mono text-white/70 space-y-1.5 text-left">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[#D4AF37]">
                <MapPin className="w-3.5 h-3.5" />
                <span className="font-bold text-[11px]">LIVE LOCATION SYNC</span>
              </div>
              {event?.latitude ? (
                <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                  <Navigation className="w-3 h-3" /> ±{event.accuracy || 15}m Accurate
                </span>
              ) : (
                <span className="text-[10px] text-amber-400 animate-pulse">Acquiring...</span>
              )}
            </div>

            {event?.latitude ? (
              <div className="flex items-center justify-between pt-1 border-t border-white/5">
                <div className="text-[11px] text-white/90">
                  {event.latitude.toFixed(5)}, {event.longitude?.toFixed(5)}
                </div>
                {event.mapsUrl && (
                  <a
                    href={event.mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-[#D4AF37] hover:underline"
                  >
                    <span>Maps</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            ) : (
              <div className="text-[10px] text-white/40 italic">
                {t.emergencyLocationSearching}
              </div>
            )}
          </div>

          {/* Large CANCEL Button */}
          {isCountdown ? (
            <button
              id="cancel-emergency-btn"
              onClick={() => emergencyService.cancelEmergency('User cancelled via emergency modal')}
              className="w-full py-4 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-[0.98] border-2 border-white/30 text-white font-luxury font-bold text-lg tracking-wider transition cursor-pointer flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
            >
              <XCircle className="w-6 h-6 text-red-400" />
              <span>{t.cancelEmergency}</span>
            </button>
          ) : isCancelled ? (
            <div className="text-emerald-400 text-xs font-mono">
              Emergency process stopped. Returning to normal telemetry monitoring...
            </div>
          ) : (
            <button
              id="dismiss-emergency-btn"
              onClick={() => emergencyService.cancelEmergency('User dismissed active call modal')}
              className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/20 text-white text-xs font-mono font-semibold transition cursor-pointer"
            >
              Close
            </button>
          )}

          {/* Hardware & Event ID Footer */}
          <div className="text-[10px] font-mono text-white/30 flex items-center justify-between pt-1">
            <span>Event ID: {event?.id || 'SW-EMG'}</span>
            <span className="flex items-center gap-1">
              <Cpu className="w-3 h-3 text-[#D4AF37]" /> Native Android Telephony Engine
            </span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
