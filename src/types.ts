export type ReadingStatus = 'SAFE' | 'CAUTION' | 'DANGER';

export interface TelemetryReading {
  id?: string;
  alcoholBac: number;
  heartRateBpm: number;
  spo2Percent: number;
  tempCelsius: number;
  ecgStatus?: string;
  sensorRaw: number;
  sensorResponse?: number;
  status: ReadingStatus;
  deviceId: string;
  timestamp: number;
  source?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  isGuest?: boolean;
  photoUrl?: string;
  emailVerified?: boolean;
}

export type ActiveScreen = 
  | 'splash' 
  | 'auth' 
  | 'verify' 
  | 'dashboard' 
  | 'health'
  | 'reports'
  | 'history' 
  | 'alerts'
  | 'settings'
  | 'voice';

export type SettingsSubPage =
  | 'main'
  | 'emergency'
  | 'notifications'
  | 'support'
  | 'privacy'
  | 'about'
  | 'voice';

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  relationship?: string;
  isActive?: boolean;
  priority?: number;
  isPrimary?: boolean;
  isSecondary?: boolean;
}

export type EmergencyEventType = 
  | 'crash' 
  | 'fall' 
  | 'soberband'
  | 'critical_health';

export type EmergencyState =
  | 'NORMAL'
  | 'EMERGENCY_DETECTED'
  | 'COUNTDOWN'
  | 'CANCELLED'
  | 'CONFIRMED_EMERGENCY'
  | 'GET_LOCATION'
  | 'LOG_EVENT'
  | 'CALL_CONTACT'
  | 'FAILED';

export interface EmergencyLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  mapsUrl: string;
  error?: string;
}

export interface EmergencyEventRecord {
  id: string;
  type: EmergencyEventType;
  state: EmergencyState;
  timestamp: string; // ISO string
  unixTimestamp: number;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  mapsUrl?: string;
  contactName?: string;
  contactPhone?: string;
  callStatus: 'pending' | 'success' | 'failed' | 'cancelled';
  callMode?: 'ACTION_CALL' | 'ACTION_DIAL';
  notes?: string;
  evidenceUri?: string;
  cameraVerified?: boolean;
  backendLogged: boolean;
  recognizedText?: string;
  detectionConfidence?: number;
  detectionReason?: string;
}

export interface EmergencySettingsConfig {
  contacts: EmergencyContact[];
  emergencyServiceNumber: string;
  emergencyServiceNumbers: string[];
  simPreference: 'SIM_1' | 'SIM_2' | 'ASK' | 'AUTOMATIC';
  autoCountdownSeconds: number; // Default: 15
  crashDetectionEnabled: boolean; // Default: true
  fallDetectionEnabled: boolean; // Default: true
  crashSensitivity: 'low' | 'medium' | 'high'; // Default: 'medium'
  cameraVerificationEnabled: boolean;
  locationSharingEnabled: boolean;
  satelliteDisplayEnabled: boolean;
  emergencyMessage: string;
}

export interface NotificationPreferences {
  pushEnabled: boolean;
  emailEnabled: boolean;
  dangerAlertsEnabled: boolean;
  highCautionAlerts: boolean;
  soundEnabled: boolean;
}

export type Language = 'en' | 'rw' | 'sw' | 'fr';

export interface VoiceIntentEntity {
  contactTarget?: string;
  contactName?: string;
  contactPhone?: string;
  action?: string;
  clarification?: string;
  message?: string;
  contextContinuation?: string;
}

export type VoiceIntent =
  | 'NORMAL_CONVERSATION'
  | 'EMERGENCY_REQUEST'
  | 'CALL_PRIMARY_CONTACT'
  | 'CALL_SECONDARY_CONTACT'
  | 'CALL_CONTACT'
  | 'SEND_VOICE_MESSAGE'
  | 'STOP_CALL'
  | 'CANCEL_EMERGENCY'
  | 'CHECK_HEALTH'
  | 'CHECK_HEART_RATE'
  | 'CHECK_SPO2'
  | 'CHECK_TEMPERATURE'
  | 'CHECK_DRIVING_READINESS'
  | 'CHECK_ALCOHOL_STATUS'
  | 'CHECK_LOCATION'
  | 'CHECK_REPORT'
  | 'CHECK_ALERTS'
  | 'CHECK_DEVICE_STATUS'
  | 'SEARCH_WEB'
  | 'HELP'
  | 'CLARIFICATION_REQUEST'
  | 'GENERAL_QUESTION'
  | 'SHARE_LOCATION'
  | 'GET_DAILY_REPORT'
  | 'UNKNOWN_COMMAND';

export interface AgentContextSources {
  readings: () => TelemetryReading[];
  currentReading: () => TelemetryReading | null;
  contacts: () => EmergencyContact[];
  primaryContact: () => EmergencyContact | null;
  secondaryContact: () => EmergencyContact | null;
  emergencyState?: () => string;
  uid?: () => string;
  deviceStatus?: () => { deviceId?: string; online?: boolean } | null;
}

export interface AgentTurnResult {
  match: VoiceIntentMatch;
  action: 'none' | 'call' | 'emergency' | 'share_location' | 'cancel_emergency' | 'end_call';
  actionTarget?: {
    name?: string;
    phone?: string;
    message?: string;
    countdownSeconds?: number;
  };
}

export type VoiceAssistantStatus = 
  | 'idle' 
  | 'listening' 
  | 'recognizing' 
  | 'processing' 
  | 'tool_calling' 
  | 'speaking' 
  | 'resuming_listening' 
  | 'error_recovery' 
  | 'error';

export type VoiceErrorCode =
  | 'NO_MICROPHONE_PERMISSION'
  | 'NO_SPEECH'
  | 'NO_MATCH'
  | 'NETWORK_ERROR'
  | 'RECOGNIZER_ERROR'
  | 'STT_UNAVAILABLE'
  | 'EMPTY_TRANSCRIPT'
  | 'AI_ERROR'
  | 'TOOL_ERROR'
  | 'TTS_ERROR';

export interface VoiceDiagnosticsState {
  micStatus: 'idle' | 'requesting' | 'active' | 'denied' | 'error';
  sttStatus: 'idle' | 'listening' | 'recognizing' | 'transcribing' | 'success' | 'error';
  ttsStatus: 'idle' | 'generating' | 'speaking' | 'completed' | 'error';
  lastTranscript: string;
  detectedLanguage: Language;
  lastIntent: VoiceIntentMatch | null;
  lastTool: string | null;
  errorCode: VoiceErrorCode | null;
  logs: string[];
}

export interface VoiceIntentMatch {
  intent: VoiceIntent;
  confidence: number;
  rawText: string;
  normalizedText: string;
  detectedLanguage: Language;
  extractedEntity?: VoiceIntentEntity;
  speechResponse: string;
  toolsUsed?: string[];
  requiresConfirmation?: boolean;
  webSearchUsed?: boolean;
}

export interface VoiceAssistantConfig {
  primaryLanguage: Language;
  wakeWordEnabled: boolean; // "SoberWatch"
  continuousListening: boolean;
  autoSpeakResponse: boolean;
  voicePitch: number;
  voiceRate: number;
  countdownSeconds: number;
  sttProvider?: 'auto' | 'web_speech' | 'gemini_audio';
  ttsProvider?: 'auto' | 'gemini_tts' | 'web_synthesis';
}
