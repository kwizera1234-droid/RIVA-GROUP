import { Geolocation } from '@capacitor/geolocation';
import { 
  EmergencyState, 
  EmergencyEventType, 
  EmergencyEventRecord, 
  EmergencyLocation, 
  EmergencySettingsConfig, 
  EmergencyContact 
} from '../types';
import { SoberWatchEmergency, syncNativeMonitoring, triggerNativeEmergencyCall } from './nativeBridge';
import { apiSendEmergencyEvent, saveLocalEmergencyEvent } from './api';
import { resolveAuthenticatedUid } from './firebase';

const EMERGENCY_CONFIG_KEY = 'soberwatch_emergency_config';
const CONTACTS_KEY = 'soberwatch_contacts';

const DEFAULT_CONFIG: EmergencySettingsConfig = {
  contacts: [],
  emergencyServiceNumber: '',
  emergencyServiceNumbers: [],
  simPreference: 'AUTOMATIC',
  autoCountdownSeconds: 15,
  crashDetectionEnabled: true,
  fallDetectionEnabled: true,
  crashSensitivity: 'medium',
  cameraVerificationEnabled: true,
  locationSharingEnabled: true,
  satelliteDisplayEnabled: true,
  emergencyMessage: 'SoberWatch detected a possible emergency. Please respond immediately.',
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

  private lastKnownLocation: EmergencyLocation | null = null;
  private nativePollingTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.config = this.loadConfig();
    void this.syncNativeMonitoring();
    this.nativePollingTimer = setInterval(() => {
      void this.consumeNativeAccidentSignal();
    }, 1500);
  }

  public getConfig(): EmergencySettingsConfig {
    return { ...this.config };
  }

  public updateConfig(partial: Partial<EmergencySettingsConfig>) {
    this.config = { ...this.config, ...partial };
    this.saveConfig();
    void this.syncNativeMonitoring();
  }

  private syncNativeMonitoring() {
    return syncNativeMonitoring({
      ...this.config,
      contacts: this.getActiveContacts().map((contact) => ({
        name: contact.name,
        phone: contact.phone,
        priority: contact.priority,
        isActive: contact.isActive,
      })),
    });
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
        const savedContacts = Array.isArray(parsed.contacts) ? parsed.contacts : contacts;
        return {
          ...DEFAULT_CONFIG,
          ...parsed,
          emergencyServiceNumber: '',
          emergencyServiceNumbers: [],
          contacts: savedContacts.map((contact: EmergencyContact, index: number) => ({
            ...contact,
            isActive: contact.isActive ?? Boolean(contact.isPrimary || contact.isSecondary || index === 0),
            priority: contact.priority ?? index,
          })),
        };
      } else if (contacts.length > 0) {
        return {
          ...DEFAULT_CONFIG,
          emergencyServiceNumber: '',
          emergencyServiceNumbers: [],
          contacts: contacts.map((contact, index) => ({
            ...contact,
            isActive: contact.isActive ?? Boolean(contact.isPrimary || contact.isSecondary || index === 0),
            priority: contact.priority ?? index,
          })),
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
    return this.getActiveContacts()[0] || null;
  }

  public getSecondaryContact(): EmergencyContact | null {
    return this.getActiveContacts()[1] || null;
  }

  public getContacts(): EmergencyContact[] {
    let contacts = this.config.contacts;
    try {
      const saved = localStorage.getItem(CONTACTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) contacts = parsed;
      }
    } catch {
      contacts = [];
    }
    return [...contacts].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  }

  public getActiveContacts(): EmergencyContact[] {
    return this.getContacts().filter((contact) => contact.isActive);
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

  public recordCameraEvidence(uri: string) {
    if (!this.currentEvent || !uri.trim()) return;
    this.currentEvent.evidenceUri = uri;
    this.currentEvent.cameraVerified = true;
    this.currentEvent.notes = `${this.currentEvent.notes || ''} | Camera evidence captured and verified`;
    this.notify();
  }

  /**
   * Triggers an Emergency Event through the state machine.
   */
  public async triggerEmergency(
    type: EmergencyEventType,
    options?: { customCountdown?: number; notes?: string; uid?: string; recognizedText?: string; location?: EmergencyLocation }
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
    const countdownDuration = options?.customCountdown ?? this.config.autoCountdownSeconds;

    const targetContact = this.getActiveContacts()[0];
    const targetPhone = targetContact?.phone || '';
    const targetName = targetContact?.name || 'Configured emergency contact';

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
      recognizedText: options?.recognizedText,
      notes: options?.notes || `Automatic emergency detection: ${type}`,
      detectionReason: options?.notes,
    };

    if (options?.location) {
      this.lastKnownLocation = options.location;
      this.currentEvent.latitude = options.location.latitude;
      this.currentEvent.longitude = options.location.longitude;
      this.currentEvent.accuracy = options.location.accuracy;
      this.currentEvent.mapsUrl = options.location.mapsUrl;
    }

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
  private async confirmAndDispatchEmergency(uid?: string) {
    const authenticatedUid = uid || await resolveAuthenticatedUid();
    if (!authenticatedUid) {
      this.currentState = 'FAILED';
      if (this.currentEvent) {
        this.currentEvent.state = 'FAILED';
        this.currentEvent.notes = `${this.currentEvent.notes || ''} | Authentication required to log emergency`;
        saveLocalEmergencyEvent(this.currentEvent);
      }
      this.notify();
      return;
    }
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
          uid: authenticatedUid,
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
          evidenceUri: this.currentEvent.evidenceUri,
          cameraVerified: this.currentEvent.cameraVerified,
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

    const callTargets = this.getActiveContacts().map((contact) => ({ name: contact.name, phone: contact.phone }))
      .filter((target, index, list) => list.findIndex((candidate) => candidate.phone === target.phone) === index);

    try {
      let initiated = false;
      let lastError: Error | null = null;
      for (const target of callTargets) {
        try {
          const callResult = await triggerNativeEmergencyCall(target.phone, false, this.config.simPreference);
          if (callResult.success) {
            initiated = true;
            if (this.currentEvent) {
              this.currentEvent.contactName = target.name;
              this.currentEvent.contactPhone = target.phone;
              this.currentEvent.callStatus = 'success';
              this.currentEvent.callMode = callResult.mode;
              this.currentEvent.notes = `${this.currentEvent.notes || ''} | Call initiated for ${target.name}`;
              saveLocalEmergencyEvent(this.currentEvent);
            }
            break;
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Android rejected the call request');
        }
      }
      if (!initiated) throw lastError || new Error('No configured emergency contact or service accepted the call request');
    } catch (callErr: any) {
      console.error('Emergency call execution error:', callErr);
      this.currentState = 'FAILED';
      if (this.currentEvent) this.currentEvent.state = 'FAILED';
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
        return new Promise((resolve, reject) => {
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
            (err) => reject(new Error(`Location unavailable: ${err.message}`)),
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 15000 }
          );
        });
      }

      throw new Error('Location services are unavailable or permission was denied');
    }
  }

  private async consumeNativeAccidentSignal() {
    if (this.currentState !== 'NORMAL') return;
    try {
      const pending = await SoberWatchEmergency.getPendingAccident();
      if (!pending.detected) return;
      const hasValidLocation =
        typeof pending.latitude === 'number' &&
        typeof pending.longitude === 'number' &&
        Number.isFinite(pending.latitude) &&
        Number.isFinite(pending.longitude) &&
        Math.abs(pending.latitude) <= 90 &&
        Math.abs(pending.longitude) <= 180 &&
        (pending.latitude !== 0 || pending.longitude !== 0);
      const location = hasValidLocation
        ? {
            latitude: pending.latitude,
            longitude: pending.longitude,
            accuracy: Math.round(pending.accuracy || 0),
            timestamp: pending.timestamp || Date.now(),
            mapsUrl: `https://www.google.com/maps?q=${pending.latitude},${pending.longitude}`,
          }
        : undefined;
      await this.triggerEmergency('crash', {
        location,
        notes: `${pending.reason || 'Multiple motion signals'} (confidence ${Math.round((pending.confidence || 0) * 100)}%)`,
      });
    } catch (error) {
      console.warn('Native accident signal check unavailable:', error);
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

}

export const emergencyService = new EmergencyService();
