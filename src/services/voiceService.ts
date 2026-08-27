import { 
  Language, 
  VoiceAssistantStatus, 
  VoiceIntentMatch, 
  VoiceAssistantConfig, 
  EmergencyContact, 
  TelemetryReading 
} from '../types';
import { classifyVoiceIntent } from './voiceIntentService';
import { emergencyService } from './emergencyService';

const VOICE_CONFIG_KEY = 'soberwatch_voice_config';

const DEFAULT_VOICE_CONFIG: VoiceAssistantConfig = {
  primaryLanguage: 'rw',
  wakeWordEnabled: true,
  continuousListening: false,
  autoSpeakResponse: true,
  voicePitch: 1.0,
  voiceRate: 1.0,
  countdownSeconds: 10,
};

type VoiceEventListener = (state: {
  status: VoiceAssistantStatus;
  transcript: string;
  interimTranscript: string;
  lastRecognizedText: string;
  lastIntent: VoiceIntentMatch | null;
  lastAssistantSpeech: string;
  errorMessage: string | null;
  isMuted: boolean;
  isAvailable: boolean;
  wakeWordActive: boolean;
}) => void;

class VoiceService {
  private config: VoiceAssistantConfig;
  private status: VoiceAssistantStatus = 'idle';
  private transcript = '';
  private interimTranscript = '';
  private lastRecognizedText = '';
  private lastIntent: VoiceIntentMatch | null = null;
  private lastAssistantSpeech = '';
  private errorMessage: string | null = null;
  private isMuted = false;
  private isAvailable = false;
  private wakeWordActive = false;

  private recognition: any = null;
  private isListeningActive = false;
  private listeners: Set<VoiceEventListener> = new Set();
  private primaryContactGetter: (() => EmergencyContact | null) | null = null;
  private secondaryContactGetter: (() => EmergencyContact | null) | null = null;
  private readingGetter: (() => TelemetryReading | null) | null = null;

  constructor() {
    this.config = this.loadConfig();
    this.checkSpeechAvailability();
    this.initSpeechRecognition();
  }

  public setContextGetters(
    primary: () => EmergencyContact | null,
    secondary: () => EmergencyContact | null,
    reading: () => TelemetryReading | null
  ) {
    this.primaryContactGetter = primary;
    this.secondaryContactGetter = secondary;
    this.readingGetter = reading;
  }

  public getConfig(): VoiceAssistantConfig {
    return { ...this.config };
  }

  public updateConfig(partial: Partial<VoiceAssistantConfig>) {
    this.config = { ...this.config, ...partial };
    this.saveConfig();
    if (this.recognition && partial.primaryLanguage) {
      this.recognition.lang = this.getLanguageCode(this.config.primaryLanguage);
    }
  }

  private loadConfig(): VoiceAssistantConfig {
    try {
      const saved = localStorage.getItem(VOICE_CONFIG_KEY);
      if (saved) return { ...DEFAULT_VOICE_CONFIG, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_VOICE_CONFIG;
  }

  private saveConfig() {
    try {
      localStorage.setItem(VOICE_CONFIG_KEY, JSON.stringify(this.config));
    } catch {}
  }

  public subscribe(listener: VoiceEventListener): () => void {
    this.listeners.add(listener);
    this.emitState(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => this.emitState(l));
  }

  private emitState(listener: VoiceEventListener) {
    listener({
      status: this.status,
      transcript: this.transcript,
      interimTranscript: this.interimTranscript,
      lastRecognizedText: this.lastRecognizedText,
      lastIntent: this.lastIntent,
      lastAssistantSpeech: this.lastAssistantSpeech,
      errorMessage: this.errorMessage,
      isMuted: this.isMuted,
      isAvailable: this.isAvailable,
      wakeWordActive: this.wakeWordActive,
    });
  }

  private checkSpeechAvailability() {
    if (typeof window !== 'undefined') {
      const hasWebSpeech = !!(
        (window as any).SpeechRecognition || 
        (window as any).webkitSpeechRecognition
      );
      const hasSynthesis = typeof window.speechSynthesis !== 'undefined';
      this.isAvailable = hasWebSpeech || hasSynthesis;
    }
  }

  private getLanguageCode(lang: Language): string {
    switch (lang) {
      case 'rw': return 'rw-RW';
      case 'fr': return 'fr-FR';
      case 'sw': return 'sw-KE';
      case 'en': 
      default: return 'en-US';
    }
  }

  /**
   * Initializes Speech Recognition instance.
   */
  private initSpeechRecognition() {
    if (typeof window === 'undefined') return;

    const SpeechRecognitionClass = 
      (window as any).SpeechRecognition || 
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      this.isAvailable = false;
      return;
    }

    try {
      const rec = new SpeechRecognitionClass();
      rec.continuous = this.config.continuousListening;
      rec.interimResults = true;
      rec.maxAlternatives = 3;
      rec.lang = this.getLanguageCode(this.config.primaryLanguage);

      rec.onstart = () => {
        this.status = 'listening';
        this.errorMessage = null;
        this.transcript = '';
        this.interimTranscript = '';
        this.notify();
      };

      rec.onresult = (event: any) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          if (res.isFinal) {
            final += res[0].transcript;
          } else {
            interim += res[0].transcript;
          }
        }

        if (interim) {
          this.status = 'recognizing';
          this.interimTranscript = interim;
          this.notify();
        }

        if (final) {
          this.processRecognizedSpeech(final);
        }
      };

      rec.onerror = (event: any) => {
        console.warn('Speech recognition event warning:', event.error);
        if (event.error === 'no-speech') {
          // If in continuous mode, keep listening without flagging hard error
          if (this.config.continuousListening && this.isListeningActive) {
            this.status = 'listening';
            this.notify();
            return;
          }
        }
        
        if (event.error === 'not-allowed') {
          this.errorMessage = 'Microphone permission denied (RECORD_AUDIO required).';
        } else if (event.error === 'network') {
          this.errorMessage = 'Network issue with cloud speech recognition. Trying offline fallback.';
        } else {
          this.errorMessage = `Voice recognition notice: ${event.error}`;
        }
        this.status = 'error';
        this.notify();
      };

      rec.onend = () => {
        if (this.isListeningActive && this.config.continuousListening) {
          try {
            rec.start();
          } catch {
            this.status = 'idle';
            this.notify();
          }
        } else {
          this.isListeningActive = false;
          if (this.status !== 'speaking' && this.status !== 'error') {
            this.status = 'idle';
          }
          this.notify();
        }
      };

      this.recognition = rec;
    } catch (e) {
      console.warn('SpeechRecognition init error:', e);
      this.isAvailable = false;
    }
  }

  /**
   * Request microphone permission and start listening.
   */
  public async startListening(): Promise<boolean> {
    this.errorMessage = null;

    // Check microphone permission via mediaDevices first for browser permission prompt
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Release stream immediately; SpeechRecognition will use microphone directly
        stream.getTracks().forEach((track) => track.stop());
      } catch (micErr: any) {
        console.warn('Microphone permission request result:', micErr);
        this.errorMessage = 'Microphone access is required for voice commands. Please allow microphone permissions.';
        this.status = 'error';
        this.notify();
        return false;
      }
    }

    if (!this.recognition) {
      this.initSpeechRecognition();
    }

    if (!this.recognition) {
      this.errorMessage = 'Speech Recognition is not available on this browser/webview.';
      this.status = 'error';
      this.notify();
      return false;
    }

    try {
      this.recognition.lang = this.getLanguageCode(this.config.primaryLanguage);
      this.recognition.continuous = this.config.continuousListening;
      this.isListeningActive = true;
      this.recognition.start();
      this.status = 'listening';
      this.notify();
      return true;
    } catch (err: any) {
      console.warn('Failed to start speech recognition:', err);
      // If already started, ignore error
      if (err.name === 'InvalidStateError') {
        this.isListeningActive = true;
        this.status = 'listening';
        this.notify();
        return true;
      }
      this.errorMessage = `Could not activate microphone: ${err?.message || 'Unknown error'}`;
      this.status = 'error';
      this.notify();
      return false;
    }
  }

  /**
   * Stop active listening session.
   */
  public stopListening() {
    this.isListeningActive = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
    }
    this.status = 'idle';
    this.notify();
  }

  public toggleListening(): Promise<boolean> {
    if (this.isListeningActive || this.status === 'listening' || this.status === 'recognizing') {
      this.stopListening();
      return Promise.resolve(false);
    } else {
      return this.startListening();
    }
  }

  public toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    this.notify();
  }

  /**
   * Processes a recognized voice transcript, classifies intent, and executes corresponding emergency or telemetry action.
   */
  public async processRecognizedSpeech(text: string, manualLanguage?: Language): Promise<VoiceIntentMatch> {
    const rawText = text.trim();
    if (!rawText) {
      return classifyVoiceIntent('', manualLanguage || this.config.primaryLanguage);
    }

    this.status = 'processing';
    this.lastRecognizedText = rawText;
    this.transcript = rawText;
    this.interimTranscript = '';
    this.notify();

    const lang = manualLanguage || this.config.primaryLanguage;
    const primary = this.primaryContactGetter ? this.primaryContactGetter() : emergencyService.getConfig().primaryContact;
    const secondary = this.secondaryContactGetter ? this.secondaryContactGetter() : emergencyService.getConfig().secondaryContact;
    const reading = this.readingGetter ? this.readingGetter() : null;

    const match = classifyVoiceIntent(rawText, lang, {
      primaryContact: primary,
      secondaryContact: secondary,
      currentReading: reading,
    });

    this.lastIntent = match;
    this.notify();

    // Check emergency state machine
    const currentEmergencyState = emergencyService.getState();

    // Action 1: Cancellation during active countdown or emergency
    if (match.intent === 'CANCEL_EMERGENCY') {
      if (currentEmergencyState === 'COUNTDOWN' || currentEmergencyState === 'EMERGENCY_DETECTED') {
        emergencyService.cancelEmergency(`Voice cancellation command: "${rawText}"`);
      }
      await this.speak(match.speechResponse, match.detectedLanguage);
      this.status = 'idle';
      this.notify();
      return match;
    }

    // Action 2: Emergency Request
    if (match.intent === 'EMERGENCY_REQUEST') {
      // Speak emergency response first
      await this.speak(match.speechResponse, match.detectedLanguage);
      
      // Trigger centralized emergency state machine with 10s countdown
      await emergencyService.triggerEmergency('voice_emergency', {
        notes: `Voice Emergency Command: "${rawText}"`,
        customCountdown: this.config.countdownSeconds || 10,
      });

      this.status = 'idle';
      this.notify();
      return match;
    }

    // Action 3: Direct Contact Call (Primary or Secondary)
    if (match.intent === 'CALL_PRIMARY_CONTACT' || match.intent === 'CALL_SECONDARY_CONTACT') {
      await this.speak(match.speechResponse, match.detectedLanguage);

      const target = match.extractedEntity?.contactName || 'Primary Contact';
      await emergencyService.triggerEmergency('voice_emergency', {
        notes: `Voice Call Request to ${target}: "${rawText}"`,
        customCountdown: 5, // Short 5-second countdown for direct contact calls as per requirements
      });

      this.status = 'idle';
      this.notify();
      return match;
    }

    // Action 4: Standard intent responses (Health, Driving, BAC, Location, Help, etc.)
    await this.speak(match.speechResponse, match.detectedLanguage);
    this.status = 'idle';
    this.notify();
    return match;
  }

  /**
   * Real Text-to-Speech (TTS) engine with multi-lingual voice mapping and fallback.
   */
  public async speak(text: string, lang: Language = this.config.primaryLanguage): Promise<void> {
    if (!text || this.isMuted || typeof window === 'undefined') return;

    this.lastAssistantSpeech = text;
    this.status = 'speaking';
    this.notify();

    if (!('speechSynthesis' in window)) {
      console.warn('Speech synthesis not available in this environment');
      this.status = 'idle';
      this.notify();
      return;
    }

    return new Promise((resolve) => {
      try {
        window.speechSynthesis.cancel(); // Stop ongoing speech

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = this.config.voiceRate || 1.0;
        utterance.pitch = this.config.voicePitch || 1.0;

        // Select the most compatible voice for the target language
        const voices = window.speechSynthesis.getVoices();
        const langCode = this.getLanguageCode(lang);

        let matchingVoice = voices.find((v) => v.lang.startsWith(langCode) || v.lang.startsWith(lang));
        
        // Kinyarwanda voice fallback: if pure rw-RW is not installed on the Android device/browser,
        // use Swahili (sw) or English (en) compatible phonetic voice
        if (!matchingVoice && lang === 'rw') {
          matchingVoice = voices.find((v) => v.lang.startsWith('sw') || v.lang.startsWith('en'));
        }

        if (matchingVoice) {
          utterance.voice = matchingVoice;
        }
        utterance.lang = langCode;

        utterance.onend = () => {
          this.status = 'idle';
          this.notify();
          resolve();
        };

        utterance.onerror = (e) => {
          console.warn('TTS utterance playback event:', e);
          this.status = 'idle';
          this.notify();
          resolve();
        };

        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn('Speech synthesis exception:', err);
        this.status = 'idle';
        this.notify();
        resolve();
      }
    });
  }

  /**
   * Simulator for developer test suite and automated flows without microphone access.
   */
  public async simulateVoiceCommand(commandText: string, lang: Language = this.config.primaryLanguage): Promise<VoiceIntentMatch> {
    return this.processRecognizedSpeech(commandText, lang);
  }
}

export const voiceService = new VoiceService();
