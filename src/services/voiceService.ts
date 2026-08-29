import { 
  Language, 
  VoiceAssistantStatus, 
  VoiceIntentMatch, 
  VoiceAssistantConfig, 
  EmergencyContact, 
  TelemetryReading,
  VoiceErrorCode,
  VoiceDiagnosticsState
} from '../types';
import { 
  classifyVoiceIntentSemantic, 
  getVoiceErrorMessage, 
  detectLanguage 
} from './voiceIntentService';
import { emergencyService } from './emergencyService';

const VOICE_CONFIG_KEY = 'soberwatch_voice_config';

const DEFAULT_VOICE_CONFIG: VoiceAssistantConfig = {
  primaryLanguage: 'rw',
  wakeWordEnabled: true,
  continuousListening: true, // Hands-free continuous interaction
  autoSpeakResponse: true,
  voicePitch: 1.0,
  voiceRate: 0.95,
  countdownSeconds: 10,
  sttProvider: 'auto',
  ttsProvider: 'auto',
};

export interface VoiceServiceState {
  status: VoiceAssistantStatus;
  transcript: string;
  interimTranscript: string;
  lastRecognizedText: string;
  lastIntent: VoiceIntentMatch | null;
  lastAssistantSpeech: string;
  errorMessage: string | null;
  errorCode: VoiceErrorCode | null;
  isMuted: boolean;
  isAvailable: boolean;
  wakeWordActive: boolean;
  diagnostics: VoiceDiagnosticsState;
}

type VoiceEventListener = (state: VoiceServiceState) => void;

class VoiceService {
  private config: VoiceAssistantConfig;
  private status: VoiceAssistantStatus = 'idle';
  private transcript = '';
  private interimTranscript = '';
  private lastRecognizedText = '';
  private lastIntent: VoiceIntentMatch | null = null;
  private lastAssistantSpeech = '';
  private errorMessage: string | null = null;
  private errorCode: VoiceErrorCode | null = null;
  private isMuted = false;
  private isAvailable = false;
  private wakeWordActive = false;

  private diagnostics: VoiceDiagnosticsState = {
    micStatus: 'idle',
    sttStatus: 'idle',
    ttsStatus: 'idle',
    lastTranscript: '',
    detectedLanguage: 'rw',
    lastIntent: null,
    lastTool: null,
    errorCode: null,
    logs: [],
  };

  // Web Speech Recognizer
  private recognition: any = null;
  private isListeningActive = false;
  private isProcessing = false;
  private restartTimeout: any = null;
  private listeners: Set<VoiceEventListener> = new Set();

  // Context Getters for Contacts & Biometrics
  private contactsGetter: (() => EmergencyContact[]) | null = null;
  private readingGetter: (() => TelemetryReading | null) | null = null;

  // MediaRecorder Parallel Audio Buffer for Multimodal Fallback
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private mediaStream: MediaStream | null = null;
  private gotWebSpeechFinal = false;
  private audioCaptureStartTime = 0;

  constructor() {
    this.config = this.loadConfig();
    this.checkSpeechAvailability();
    this.initSpeechRecognition();
  }

  public setContextGetters(
    contacts: () => EmergencyContact[],
    reading: () => TelemetryReading | null
  ) {
    this.contactsGetter = contacts;
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
      errorCode: this.errorCode,
      isMuted: this.isMuted,
      isAvailable: this.isAvailable,
      wakeWordActive: this.wakeWordActive,
      diagnostics: { ...this.diagnostics },
    });
  }

  /**
   * Diagnostic log recording strictly respecting user constraints (no passwords/tokens/coordinates).
   */
  private logDiagnostic(entry: string) {
    const timestamp = new Date().toLocaleTimeString();
    const formatted = `[${timestamp}] ${entry}`;
    console.log(entry);
    this.diagnostics.logs = [formatted, ...this.diagnostics.logs.slice(0, 59)];
  }

  private checkSpeechAvailability() {
    if (typeof window !== 'undefined') {
      const hasWebSpeech = !!(
        (window as any).SpeechRecognition || 
        (window as any).webkitSpeechRecognition
      );
      const hasSynthesis = typeof window.speechSynthesis !== 'undefined';
      const hasMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
      this.isAvailable = hasWebSpeech || hasSynthesis || hasMedia;
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
   * Initializes Web Speech Recognition.
   */
  private initSpeechRecognition() {
    if (typeof window === 'undefined') return;

    const SpeechRecognitionClass = 
      (window as any).SpeechRecognition || 
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      this.logDiagnostic('[VOICE] Web Speech API not present natively; Hybrid Audio STT will manage transcription');
      return;
    }

    try {
      if (this.recognition) {
        try { this.recognition.abort(); } catch {}
      }

      const rec = new SpeechRecognitionClass();
      rec.continuous = false; // We manage continuous turns via robust state machine
      rec.interimResults = true;
      rec.maxAlternatives = 3;
      rec.lang = this.getLanguageCode(this.config.primaryLanguage);

      rec.onstart = () => {
        this.logDiagnostic('[VOICE] microphone started');
        this.status = 'listening';
        this.diagnostics.micStatus = 'active';
        this.diagnostics.sttStatus = 'listening';
        this.errorMessage = null;
        this.errorCode = null;
        this.transcript = '';
        this.interimTranscript = '';
        this.notify();
      };

      rec.onspeechstart = () => {
        this.logDiagnostic('[VOICE] speech started');
        this.diagnostics.sttStatus = 'recognizing';
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
          this.diagnostics.lastTranscript = interim;
          this.notify();
        }

        if (final && final.trim()) {
          this.gotWebSpeechFinal = true;
          const cleaned = final.trim();
          this.logDiagnostic(`[VOICE] transcript received: "${cleaned}"`);
          this.logDiagnostic(`[VOICE] transcript length: ${cleaned.length}`);
          this.stopMediaRecorder();
          this.processRecognizedSpeech(cleaned);
        }
      };

      rec.onerror = async (event: any) => {
        const errorType = event.error || 'unknown';
        
        // If web speech errored or couldn't match (common for Kinyarwanda), try Server Multimodal STT!
        if (!this.gotWebSpeechFinal && this.audioChunks.length > 0) {
          this.logDiagnostic(`[VOICE] Web Speech reported ${errorType}; engaging Server Multimodal STT`);
          const serverSuccess = await this.tryServerMultimodalSTT();
          if (serverSuccess) return;
        }

        this.logDiagnostic(`[VOICE] recognition error: ${errorType}`);

        if (errorType === 'no-speech') {
          this.errorCode = 'NO_SPEECH';
          this.errorMessage = getVoiceErrorMessage('NO_SPEECH', this.config.primaryLanguage);
        } else if (errorType === 'not-allowed') {
          this.errorCode = 'NO_MICROPHONE_PERMISSION';
          this.diagnostics.micStatus = 'denied';
          this.errorMessage = getVoiceErrorMessage('NO_MICROPHONE_PERMISSION', this.config.primaryLanguage);
        } else if (errorType === 'network') {
          this.errorCode = 'NETWORK_ERROR';
          this.errorMessage = getVoiceErrorMessage('NETWORK_ERROR', this.config.primaryLanguage);
        } else if (errorType === 'no-match') {
          this.errorCode = 'NO_MATCH';
          this.errorMessage = getVoiceErrorMessage('EMPTY_TRANSCRIPT', this.config.primaryLanguage);
        } else {
          this.errorCode = 'RECOGNIZER_ERROR';
          this.errorMessage = getVoiceErrorMessage('RECOGNIZER_ERROR', this.config.primaryLanguage);
        }

        this.status = 'error';
        this.diagnostics.sttStatus = 'error';
        this.diagnostics.errorCode = this.errorCode;
        this.notify();

        if (this.isListeningActive && this.config.continuousListening) {
          this.scheduleRestart(1200);
        }
      };

      rec.onend = async () => {
        this.logDiagnostic('[VOICE] recognition stream ended');

        // Check if we captured audio that was not processed yet
        if (!this.gotWebSpeechFinal && this.isListeningActive && this.audioChunks.length > 0) {
          const duration = Date.now() - this.audioCaptureStartTime;
          if (duration > 600) {
            const serverSuccess = await this.tryServerMultimodalSTT();
            if (serverSuccess) return;
          }
        }

        if (this.isListeningActive && this.config.continuousListening && !this.isProcessing && this.status !== 'speaking') {
          this.scheduleRestart(400);
        } else if (!this.isProcessing && this.status !== 'speaking') {
          this.isListeningActive = false;
          this.status = 'idle';
          this.diagnostics.micStatus = 'idle';
          this.diagnostics.sttStatus = 'idle';
          this.notify();
        }
      };

      this.recognition = rec;
    } catch (e) {
      console.warn('SpeechRecognition init error:', e);
    }
  }

  /**
   * MediaRecorder fallback for high-fidelity Kinyarwanda multimodal transcription.
   */
  private async startMediaRecorder(stream: MediaStream) {
    try {
      this.audioChunks = [];
      this.audioCaptureStartTime = Date.now();
      
      const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      let chosenMime = '';
      for (const m of mimeTypes) {
        if (MediaRecorder.isTypeSupported(m)) {
          chosenMime = m;
          break;
        }
      }

      this.mediaRecorder = new MediaRecorder(stream, chosenMime ? { mimeType: chosenMime } : undefined);
      
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      this.mediaRecorder.start(250);
    } catch (e) {
      console.warn('[VOICE] MediaRecorder init notice:', e);
    }
  }

  private stopMediaRecorder() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {}
    }
  }

  /**
   * Attempts transcription via backend Gemini 2.5/3.7 Flash Multimodal API.
   */
  private async tryServerMultimodalSTT(): Promise<boolean> {
    if (this.audioChunks.length === 0) return false;

    try {
      this.stopMediaRecorder();
      const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
      const audioBlob = new Blob(this.audioChunks, { type: mimeType });

      if (audioBlob.size < 600) {
        return false;
      }

      this.diagnostics.sttStatus = 'recognizing';
      this.notify();

      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          resolve(base64 || '');
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      if (!base64Data) return false;

      const res = await fetch('/api/voice/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64Data,
          mimeType,
          language: this.config.primaryLanguage,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const serverTranscript = (data.transcript || '').trim();
        if (serverTranscript && serverTranscript.length > 0) {
          this.gotWebSpeechFinal = true;
          this.logDiagnostic(`[VOICE] transcript received: "${serverTranscript}"`);
          this.logDiagnostic(`[VOICE] transcript length: ${serverTranscript.length}`);
          await this.processRecognizedSpeech(serverTranscript);
          return true;
        }
      }
    } catch (err: any) {
      this.logDiagnostic(`[VOICE] Server STT attempt notice: ${err?.message}`);
    }

    return false;
  }

  private scheduleRestart(delayMs = 400) {
    if (this.restartTimeout) clearTimeout(this.restartTimeout);
    this.restartTimeout = setTimeout(() => {
      if (this.isListeningActive && !this.isProcessing && this.status !== 'speaking') {
        try {
          this.logDiagnostic('[VOICE] recognition restarted');
          this.status = 'listening';
          this.diagnostics.micStatus = 'active';
          this.diagnostics.sttStatus = 'listening';
          this.notify();

          this.gotWebSpeechFinal = false;
          if (this.mediaStream) {
            this.startMediaRecorder(this.mediaStream);
          }
          if (this.recognition) {
            try {
              this.recognition.start();
            } catch (err: any) {
              if (err.name !== 'InvalidStateError') {
                console.warn('Recognition restart error:', err);
              }
            }
          }
        } catch {
          this.status = 'idle';
          this.notify();
        }
      }
    }, delayMs);
  }

  /**
   * Request microphone permission and start listening.
   */
  public async startListening(): Promise<boolean> {
    this.errorMessage = null;
    this.errorCode = null;
    this.diagnostics.errorCode = null;
    this.gotWebSpeechFinal = false;

    // 1. Acquire persistent microphone MediaStream
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        this.diagnostics.micStatus = 'requesting';
        this.notify();
        
        if (this.mediaStream) {
          this.mediaStream.getTracks().forEach((t) => t.stop());
        }

        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        this.diagnostics.micStatus = 'active';
        this.startMediaRecorder(this.mediaStream);
      } catch (micErr: any) {
        this.logDiagnostic('[VOICE] Microphone permission denied');
        this.errorCode = 'NO_MICROPHONE_PERMISSION';
        this.diagnostics.micStatus = 'denied';
        this.diagnostics.errorCode = 'NO_MICROPHONE_PERMISSION';
        this.errorMessage = getVoiceErrorMessage('NO_MICROPHONE_PERMISSION', this.config.primaryLanguage);
        this.status = 'error';
        this.notify();
        return false;
      }
    }

    if (!this.recognition) {
      this.initSpeechRecognition();
    }

    this.isListeningActive = true;
    this.status = 'listening';
    this.diagnostics.micStatus = 'active';
    this.diagnostics.sttStatus = 'listening';
    this.notify();

    if (this.recognition) {
      try {
        this.recognition.lang = this.getLanguageCode(this.config.primaryLanguage);
        this.recognition.start();
      } catch (err: any) {
        if (err.name !== 'InvalidStateError') {
          console.warn('[VOICE] Native WebSpeech start notice:', err?.message);
        }
      }
    } else {
      this.logDiagnostic('[VOICE] microphone started');
    }

    return true;
  }

  /**
   * Stop active listening session.
   */
  public stopListening() {
    this.isListeningActive = false;
    if (this.restartTimeout) clearTimeout(this.restartTimeout);
    
    this.stopMediaRecorder();
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {}
    }

    this.status = 'idle';
    this.diagnostics.micStatus = 'idle';
    this.diagnostics.sttStatus = 'idle';
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
   * Processes a recognized voice transcript, classifies intent with Gemini 3.7 Flash, and executes tool actions.
   */
  public async processRecognizedSpeech(text: string, manualLanguage?: Language): Promise<VoiceIntentMatch> {
    const rawText = text.trim();
    const lang = manualLanguage || this.config.primaryLanguage;

    if (!rawText) {
      this.errorCode = 'EMPTY_TRANSCRIPT';
      this.status = 'idle';
      this.notify();
      return {
        intent: 'UNKNOWN_COMMAND',
        confidence: 0,
        rawText: '',
        normalizedText: '',
        detectedLanguage: lang,
        speechResponse: getVoiceErrorMessage('EMPTY_TRANSCRIPT', lang),
      };
    }

    this.isProcessing = true;
    this.status = 'processing';
    this.lastRecognizedText = rawText;
    this.transcript = rawText;
    this.interimTranscript = '';
    this.diagnostics.lastTranscript = rawText;
    this.diagnostics.sttStatus = 'success';
    this.notify();

    const detected = detectLanguage(rawText, lang);
    this.diagnostics.detectedLanguage = detected;
    this.logDiagnostic(`[VOICE] detected language: ${detected}`);
    this.logDiagnostic('[VOICE] AI request started');

    const contactsList = this.contactsGetter ? this.contactsGetter() : [];
    const currentReading = this.readingGetter ? this.readingGetter() : null;

    let match: VoiceIntentMatch;
    try {
      match = await classifyVoiceIntentSemantic(rawText, detected, {
        contacts: contactsList,
        currentReading,
      });
      this.logDiagnostic(`[VOICE] AI response received: intent=${match.intent}, confidence=${match.confidence}`);
    } catch (err: any) {
      this.logDiagnostic(`[VOICE] AI processing notice: ${err?.message}`);
      this.errorCode = 'AI_ERROR';
      match = {
        intent: 'NORMAL_CONVERSATION',
        confidence: 0.85,
        rawText,
        normalizedText: rawText,
        detectedLanguage: detected,
        speechResponse: 'Nabyumvise neza.',
      };
    }

    this.lastIntent = match;
    this.diagnostics.lastIntent = match;
    this.diagnostics.lastTool = match.extractedEntity?.action || match.intent;
    this.notify();

    // Check emergency state machine
    const currentEmergencyState = emergencyService.getState();

    // Action 1: Voice Cancellation during active countdown or emergency
    if (match.intent === 'CANCEL_EMERGENCY') {
      this.logDiagnostic('[VOICE] Tool Action: CANCEL_EMERGENCY executed');
      if (currentEmergencyState === 'COUNTDOWN' || currentEmergencyState === 'EMERGENCY_DETECTED') {
        emergencyService.cancelEmergency(`Voice cancellation command: "${rawText}"`);
      }
      await this.speak(match.speechResponse, match.detectedLanguage);
      this.finishProcessing();
      return match;
    }

    // Action 2: Voice Emergency SOS Request
    if (match.intent === 'EMERGENCY_REQUEST') {
      this.logDiagnostic('[VOICE] Tool Action: EMERGENCY_REQUEST triggered');
      await this.speak(match.speechResponse, match.detectedLanguage);
      
      await emergencyService.triggerEmergency('voice_emergency', {
        notes: `Voice Emergency Command: "${rawText}"`,
        customCountdown: this.config.countdownSeconds || 10,
      });

      this.finishProcessing();
      return match;
    }

    // Action 3: Direct Contact Calling
    if (
      match.intent === 'CALL_PRIMARY_CONTACT' || 
      match.intent === 'CALL_SECONDARY_CONTACT' || 
      match.intent === 'CALL_CONTACT'
    ) {
      const targetName = match.extractedEntity?.contactName || 'Primary Contact';
      this.logDiagnostic(`[VOICE] Tool Action: CALL_CONTACT triggered for ${targetName}`);
      await this.speak(match.speechResponse, match.detectedLanguage);

      await emergencyService.triggerEmergency('voice_emergency', {
        notes: `Voice Call Request to ${targetName}: "${rawText}"`,
        customCountdown: 5,
      });

      this.finishProcessing();
      return match;
    }

    // Action 4: Standard intent responses (Health, Driving, BAC, Location, Help, Conversational)
    await this.speak(match.speechResponse, match.detectedLanguage);
    this.finishProcessing();
    return match;
  }

  private finishProcessing() {
    this.isProcessing = false;
    if (this.isListeningActive && this.config.continuousListening) {
      this.scheduleRestart(350);
    } else {
      this.status = 'idle';
      this.diagnostics.micStatus = 'idle';
      this.diagnostics.sttStatus = 'idle';
      this.notify();
    }
  }

  /**
   * Text-to-Speech (TTS) engine with Server Gemini TTS & Client-side Bantu phonetic synthesis.
   */
  public async speak(text: string, lang: Language = this.config.primaryLanguage): Promise<void> {
    if (!text || this.isMuted || typeof window === 'undefined') return;

    this.lastAssistantSpeech = text;
    this.status = 'speaking';
    this.diagnostics.ttsStatus = 'generating';
    this.logDiagnostic('[VOICE] TTS started');
    this.notify();

    // 1. Try server-side Gemini Audio TTS endpoint
    if (this.config.ttsProvider !== 'web_synthesis') {
      try {
        const response = await fetch('/api/voice/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, language: lang }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.audioBase64) {
            await this.playBase64Audio(data.audioBase64, data.mimeType || 'audio/mp3');
            this.logDiagnostic('[VOICE] TTS finished');
            this.diagnostics.ttsStatus = 'completed';
            this.notify();
            return;
          }
        }
      } catch {
        // Fall back seamlessly to client synthesis
      }
    }

    // 2. Client-side Web Speech Synthesis fallback
    if (!('speechSynthesis' in window)) {
      this.status = 'idle';
      this.diagnostics.ttsStatus = 'error';
      this.notify();
      return;
    }

    return new Promise((resolve) => {
      try {
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = this.config.voiceRate || 0.95;
        utterance.pitch = this.config.voicePitch || 1.0;

        const voices = window.speechSynthesis.getVoices();
        const langCode = this.getLanguageCode(lang);

        // Kinyarwanda phonetic voice selection:
        // If native rw-RW voice is absent, Bantu-phonetic (Swahili) or Romance voices reproduce
        // Kinyarwanda vowels (a, e, i, o, u) with pure open sounds.
        let matchingVoice = voices.find((v) => v.lang.startsWith(langCode) || v.lang.startsWith(lang));
        if (!matchingVoice && lang === 'rw') {
          matchingVoice = voices.find((v) => v.lang.startsWith('sw') || v.lang.startsWith('sw-KE') || v.lang.startsWith('sw-TZ'));
        }
        if (!matchingVoice) {
          matchingVoice = voices.find((v) => v.lang.startsWith('fr') || v.lang.startsWith('en'));
        }

        if (matchingVoice) {
          utterance.voice = matchingVoice;
        }
        utterance.lang = langCode;

        utterance.onstart = () => {
          this.diagnostics.ttsStatus = 'speaking';
          this.notify();
        };

        utterance.onend = () => {
          this.logDiagnostic('[VOICE] TTS finished');
          this.diagnostics.ttsStatus = 'completed';
          this.notify();
          resolve();
        };

        utterance.onerror = () => {
          this.logDiagnostic('[VOICE] TTS finished');
          this.diagnostics.ttsStatus = 'completed';
          this.notify();
          resolve();
        };

        window.speechSynthesis.speak(utterance);
      } catch (err) {
        this.diagnostics.ttsStatus = 'error';
        this.notify();
        resolve();
      }
    });
  }

  private playBase64Audio(base64Data: string, mimeType: string): Promise<void> {
    return new Promise((resolve) => {
      try {
        const audio = new Audio(`data:${mimeType};base64,${base64Data}`);
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        audio.play().catch(() => resolve());
      } catch {
        resolve();
      }
    });
  }

  /**
   * Simulation method for developer test panel and automated tests.
   */
  public async simulateVoiceCommand(commandText: string, lang: Language = this.config.primaryLanguage): Promise<VoiceIntentMatch> {
    this.logDiagnostic(`[VOICE] Manual simulated command: "${commandText}"`);
    return this.processRecognizedSpeech(commandText, lang);
  }
}

export const voiceService = new VoiceService();
