import { Geolocation } from '@capacitor/geolocation';
import { 
  EmergencyState, 
  EmergencyEventType, 
  EmergencyEventRecord, 
  EmergencyLocation, 
  EmergencySettingsConfig, 
  EmergencyContact 
} from '../types';
import { triggerNativeEmergencyCall } from './nativeBridge';
import { apiSendEmergencyEvent, saveLocalEmergencyEvent } from './api';

const EMERGENCY_CONFIG_KEY = 'soberwatch_emergency_config';
const CONTACTS_KEY = 'soberwatch_contacts';

// Default emergency configuration
const DEFAULT_CONFIG: EmergencySettingsConfig = {
  primaryContact: null,
  secondaryContact: null,
  emergencyServiceNumber: '112', // Rwanda National Emergency Service
  sosCountdownSeconds: 10,
  autoCountdownSeconds: 15,
  crashDetectionEnabled: true,
  fallDetectionEnabled: true,
  crashSensitivity: 'medium',
  isTestMode: false,
};

type StateChangeListener = (state: EmergencyState, event: EmergencyEventRecord | null, secondsLeft: number) => void;

class EmergencyService {
  private config: EmergencySettingsConfig;
  private currentState: EmergencyState = 'NORMAL';
  private currentEvent: EmergencyEventRecord | null = null;
  private countdownTimer: any = null;
  private secondsRemaining = 0;
  private listeners: Set<StateChangeListener> = new Set();
  private audioCtx: AudioContext | null = null;
  private sirenOscillator: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;

  // Sensor state for crash & fall detection
  private isMotionListening = false;
  private lastHighImpactTime = 0;
  private motionSampleBuffer: { time: number; mag: number }[] = [];
  private potentialCrashCandidate: { time: number; peakMag: number } | null = null;
  private freeFallStartTime: number | null = null;
  private lastKnownLocation: EmergencyLocation | null = null;

  constructor() {
    this.config = this.loadConfig();
    this.initSensors();
  }

  public getConfig(): EmergencySettingsConfig {
    return { ...this.config };
  }

  public updateConfig(partial: Partial<EmergencySettingsConfig>) {
    this.config = { ...this.config, ...partial };
    this.saveConfig();
  }

  private loadConfig(): EmergencySettingsConfig {
    try {
      const saved = localStorage.getItem(EMERGENCY_CONFIG_KEY);
      const contactsSaved = localStorage.getItem(CONTACTS_KEY);
      
      let contacts: EmergencyContact[] = [];
      if (contactsSaved) {
        try { contacts = JSON.parse(contactsSaved); } catch {}
      }

      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_CONFIG,
          ...parsed,
          primaryContact: parsed.primaryContact || contacts.find((c) => c.isPrimary) || contacts[0] || null,
          secondaryContact: parsed.secondaryContact || contacts.find((c) => c.isSecondary) || (contacts.length > 1 ? contacts[1] : null),
        };
      } else if (contacts.length > 0) {
        return {
          ...DEFAULT_CONFIG,
          primaryContact: contacts.find((c) => c.isPrimary) || contacts[0] || null,
          secondaryContact: contacts.find((c) => c.isSecondary) || (contacts.length > 1 ? contacts[1] : null),
        };
      }
    } catch {}
    return DEFAULT_CONFIG;
  }

  private saveConfig() {
    try {
      localStorage.setItem(EMERGENCY_CONFIG_KEY, JSON.stringify(this.config));
    } catch {}
  }

  public subscribe(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    listener(this.currentState, this.currentEvent, this.secondsRemaining);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l(this.currentState, this.currentEvent, this.secondsRemaining));
  }

  public getPrimaryContact(): EmergencyContact | null {
    return this.config.primaryContact;
  }

  public getSecondaryContact(): EmergencyContact | null {
    return this.config.secondaryContact;
  }

  public getState(): EmergencyState {
    return this.currentState;
  }

  public getCurrentEvent(): EmergencyEventRecord | null {
    return this.currentEvent;
  }

  public getSecondsRemaining(): number {
    return this.secondsRemaining;
  }

  /**
   * Triggers an Emergency Event through the state machine.
   */
  public async triggerEmergency(
    type: EmergencyEventType,
    options?: { customCountdown?: number; notes?: string; uid?: string; recognizedText?: string }
  ) {
    // Prevent duplicate triggers if already in countdown or confirmed
    if (
      this.currentState === 'EMERGENCY_DETECTED' ||
      this.currentState === 'COUNTDOWN' ||
      this.currentState === 'CONFIRMED_EMERGENCY' ||
      this.currentState === 'GET_LOCATION' ||
      this.currentState === 'CALL_CONTACT'
    ) {
      console.warn('Emergency already in progress, ignoring secondary trigger');
      return;
    }

    const eventId = `emg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const isManual = type === 'manual_sos';
    const countdownDuration = options?.customCountdown ?? (isManual ? this.config.sosCountdownSeconds : this.config.autoCountdownSeconds);

    const targetContact = this.config.primaryContact || this.config.secondaryContact;
    const targetPhone = targetContact?.phone || this.config.emergencyServiceNumber || '112';
    const targetName = targetContact?.name || 'Emergency Services (112)';

    this.currentEvent = {
      id: eventId,
      type,
      state: 'EMERGENCY_DETECTED',
      timestamp: new Date().toISOString(),
      unixTimestamp: Date.now(),
      contactName: targetName,
      contactPhone: targetPhone,
      callStatus: 'pending',
      backendLogged: false,
      testMode: this.config.isTestMode,
      recognizedText: options?.recognizedText,
      notes: options?.notes || (isManual ? 'Emergency SOS triggered by user' : `Automatic emergency detection: ${type}`),
    };

    this.currentState = 'EMERGENCY_DETECTED';
    this.secondsRemaining = Math.max(1, countdownDuration);
    this.notify();

    // Start audio alarm pulse
    this.startAudioAlarm();

    // Transition to COUNTDOWN state
    this.currentState = 'COUNTDOWN';
    this.notify();

    // Immediately begin background GPS acquisition in parallel
    this.acquireLocation().catch((err) => console.warn('Pre-fetching GPS warning:', err));

    if (this.countdownTimer) clearInterval(this.countdownTimer);

    this.countdownTimer = setInterval(() => {
      this.secondsRemaining -= 1;
      this.notify();

      if (this.secondsRemaining <= 0) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        this.confirmAndDispatchEmergency(options?.uid);
      }
    }, 1000);
  }

  /**
   * Cancels the currently active emergency countdown.
   */
  public cancelEmergency(reason = 'Cancelled by user') {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }

    this.stopAudioAlarm();

    if (this.currentEvent) {
      this.currentEvent.state = 'CANCELLED';
      this.currentEvent.callStatus = 'cancelled';
      this.currentEvent.notes = (this.currentEvent.notes ? this.currentEvent.notes + ' | ' : '') + reason;
      saveLocalEmergencyEvent(this.currentEvent);
    }

    this.currentState = 'CANCELLED';
    this.secondsRemaining = 0;
    this.notify();

    // Return to NORMAL after a short acknowledgement delay
    setTimeout(() => {
      if (this.currentState === 'CANCELLED') {
        this.currentState = 'NORMAL';
        this.currentEvent = null;
        this.notify();
      }
    }, 2500);
  }

  /**
   * Confirmed emergency workflow execution.
   */
  private async confirmAndDispatchEmergency(uid = 'test-user') {
    this.stopAudioAlarm();
    this.currentState = 'CONFIRMED_EMERGENCY';
    if (this.currentEvent) {
      this.currentEvent.state = 'CONFIRMED_EMERGENCY';
    }
    this.notify();

    // State 1: GET_LOCATION
    this.currentState = 'GET_LOCATION';
    if (this.currentEvent) this.currentEvent.state = 'GET_LOCATION';
    this.notify();

    let location: EmergencyLocation | null = null;
    try {
      location = await this.acquireLocation();
    } catch (locErr) {
      console.warn('Location retrieval warning:', locErr);
      location = this.lastKnownLocation;
    }

    if (this.currentEvent && location) {
      this.currentEvent.latitude = location.latitude;
      this.currentEvent.longitude = location.longitude;
      this.currentEvent.accuracy = location.accuracy;
      this.currentEvent.mapsUrl = location.mapsUrl;
    }

    // State 2: LOG_EVENT to backend & local storage
    this.currentState = 'LOG_EVENT';
    if (this.currentEvent) this.currentEvent.state = 'LOG_EVENT';
    this.notify();

    if (this.currentEvent) {
      try {
        const backendRes = await apiSendEmergencyEvent({
          uid,
          eventId: this.currentEvent.id,
          type: this.currentEvent.type,
          severity: 'high',
          latitude: this.currentEvent.latitude,
          longitude: this.currentEvent.longitude,
          accuracy: this.currentEvent.accuracy,
          timestamp: this.currentEvent.timestamp,
          contact: this.currentEvent.contactPhone,
          mapsUrl: this.currentEvent.mapsUrl,
          notes: this.currentEvent.notes,
          recognizedText: this.currentEvent.recognizedText,
        });
        this.currentEvent.backendLogged = backendRes.success;
      } catch (logErr) {
        console.warn('Backend emergency logging notice (offline):', logErr);
      }
      saveLocalEmergencyEvent(this.currentEvent);
    }

    // State 3: CALL_CONTACT (Native Android ACTION_CALL or Test Simulation)
    this.currentState = 'CALL_CONTACT';
    if (this.currentEvent) this.currentEvent.state = 'CALL_CONTACT';
    this.notify();

    const targetPhone = this.currentEvent?.contactPhone || this.config.primaryContact?.phone || this.config.emergencyServiceNumber || '112';

    try {
      const isServiceNumber = this.isPublicEmergencyServiceNumber(targetPhone);
      const callResult = await triggerNativeEmergencyCall(
        targetPhone, 
        this.config.isTestMode, 
        isServiceNumber
      );

      if (this.currentEvent) {
        this.currentEvent.callStatus = this.config.isTestMode ? 'simulated' : (callResult.success ? 'success' : 'failed');
        this.currentEvent.callMode = callResult.mode;
        saveLocalEmergencyEvent(this.currentEvent);
      }
    } catch (callErr: any) {
      console.error('Emergency call execution error:', callErr);
      if (this.currentEvent) {
        this.currentEvent.callStatus = 'failed';
        this.currentEvent.notes = (this.currentEvent.notes || '') + ` | Call error: ${callErr?.message || 'Unknown'}`;
        saveLocalEmergencyEvent(this.currentEvent);
      }
    }

    this.notify();
  }

  /**
   * Acquires high accuracy GPS coordinates.
   */
  public async acquireLocation(): Promise<EmergencyLocation> {
    try {
      // First try Capacitor Geolocation native plugin
      const pos = await Promise.race([
        Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 7000,
          maximumAge: 10000,
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('GPS timeout')), 7500))
      ]);

      const loc: EmergencyLocation = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy || 0),
        timestamp: pos.timestamp,
        mapsUrl: `https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`,
      };
      this.lastKnownLocation = loc;
      return loc;
    } catch (capErr) {
      // Fallback to browser navigator.geolocation
      if (navigator.geolocation) {
        return new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (geoPos) => {
              const loc: EmergencyLocation = {
                latitude: geoPos.coords.latitude,
                longitude: geoPos.coords.longitude,
                accuracy: Math.round(geoPos.coords.accuracy || 0),
                timestamp: geoPos.timestamp,
                mapsUrl: `https://www.google.com/maps?q=${geoPos.coords.latitude},${geoPos.coords.longitude}`,
              };
              this.lastKnownLocation = loc;
              resolve(loc);
            },
            (err) => {
              const fallback: EmergencyLocation = {
                latitude: -1.9441, // Default Kigali baseline if GPS denied/unavailable in container
                longitude: 30.0619,
                accuracy: 100,
                timestamp: Date.now(),
                mapsUrl: 'https://www.google.com/maps?q=-1.9441,30.0619',
                error: err.message,
              };
              resolve(fallback);
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 15000 }
          );
        });
      }

      const fallback: EmergencyLocation = {
        latitude: -1.9441,
        longitude: 30.0619,
        accuracy: 100,
        timestamp: Date.now(),
        mapsUrl: 'https://www.google.com/maps?q=-1.9441,30.0619',
      };
      return fallback;
    }
  }

  /**
   * Accelerometer & Gyroscope Crash & Fall Detection Engine
   */
  private initSensors() {
    if (typeof window === 'undefined') return;

    const handleMotion = (event: DeviceMotionEvent) => {
      if (!this.config.crashDetectionEnabled && !this.config.fallDetectionEnabled) return;

      const acc = event.accelerationIncludingGravity || event.acceleration;
      if (!acc) return;

      const x = acc.x || 0;
      const y = acc.y || 0;
      const z = acc.z || 0;
      const mag = Math.sqrt(x * x + y * y + z * z);
      const now = Date.now();

      // Maintain a sliding window buffer of the last 2.5 seconds
      this.motionSampleBuffer.push({ time: now, mag });
      if (this.motionSampleBuffer.length > 50) {
        this.motionSampleBuffer.shift();
      }

      // Sensitivity thresholds (m/s^2):
      const crashThresholds = {
        low: 35,
        medium: 26,
        high: 18,
      };
      const crashLimit = crashThresholds[this.config.crashSensitivity] || 26;

      // 1. Crash Detection Logic (Sudden high G impact followed by stillness window)
      if (this.config.crashDetectionEnabled && mag > crashLimit) {
        if (!this.potentialCrashCandidate || now - this.potentialCrashCandidate.time > 3000) {
          this.potentialCrashCandidate = { time: now, peakMag: mag };

          // Confirm candidate after a 1.2s stillness evaluation window
          setTimeout(() => {
            if (this.potentialCrashCandidate && Math.abs(now - this.potentialCrashCandidate.time) < 2000) {
              // Calculate post-impact variance
              const recentSamples = this.motionSampleBuffer.filter((s) => s.time > now + 300);
              const isStill = recentSamples.length === 0 || recentSamples.every((s) => Math.abs(s.mag - 9.8) < 8);
              
              if (isStill && this.currentState === 'NORMAL') {
                this.triggerEmergency('crash', {
                  notes: `Severe crash impact detected (${this.potentialCrashCandidate.peakMag.toFixed(1)} m/s²)`,
                });
              }
              this.potentialCrashCandidate = null;
            }
          }, 1200);
        }
      }

      // 2. Fall Detection Logic (Free-fall <3 m/s^2 drop followed by impact > 22 m/s^2)
      if (this.config.fallDetectionEnabled) {
        if (mag < 3.0) {
          if (!this.freeFallStartTime) this.freeFallStartTime = now;
        } else if (this.freeFallStartTime && now - this.freeFallStartTime > 150) {
          if (mag > 22.0 && this.currentState === 'NORMAL') {
            this.freeFallStartTime = null;
            this.triggerEmergency('fall', {
              notes: `Sudden free-fall and ground impact detected (${mag.toFixed(1)} m/s²)`,
            });
          } else if (now - this.freeFallStartTime > 800) {
            this.freeFallStartTime = null;
          }
        }
      }
    };

    try {
      window.addEventListener('devicemotion', handleMotion, { passive: true });
      this.isMotionListening = true;
    } catch (e) {
      console.warn('Device motion listener initialization note:', e);
    }
  }

  /**
   * Synthesizes emergency audio siren beeps.
   */
  private startAudioAlarm() {
    try {
      if (typeof window === 'undefined') return;
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;

      if (!this.audioCtx) {
        this.audioCtx = new AudioCtxClass();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, this.audioCtx.currentTime); // High A

      // Frequency alternation every 400ms for emergency siren feel
      let toggle = false;
      const sirenInterval = setInterval(() => {
        if (!this.sirenOscillator || !this.audioCtx) {
          clearInterval(sirenInterval);
          return;
        }
        toggle = !toggle;
        osc.frequency.setValueAtTime(toggle ? 960 : 720, this.audioCtx.currentTime);
      }, 400);

      gain.gain.setValueAtTime(0.2, this.audioCtx.currentTime);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      this.sirenOscillator = osc;
      this.sirenGain = gain;

      // Haptic vibration pulse if supported
      if (navigator.vibrate) {
        navigator.vibrate([400, 200, 400, 200, 600]);
      }
    } catch (e) {
      console.warn('Audio alarm synthesis notice:', e);
    }
  }

  private stopAudioAlarm() {
    try {
      if (this.sirenOscillator) {
        this.sirenOscillator.stop();
        this.sirenOscillator.disconnect();
        this.sirenOscillator = null;
      }
      if (this.sirenGain) {
        this.sirenGain.disconnect();
        this.sirenGain = null;
      }
    } catch {}
  }

  private isPublicEmergencyServiceNumber(number: string): boolean {
    if (!number) return false;
    const clean = number.replace(/[^0-9]/g, '');
    return ['112', '911', '999', '912', '111', '113', '114', '000'].includes(clean);
  }
}

export const emergencyService = new EmergencyService();
