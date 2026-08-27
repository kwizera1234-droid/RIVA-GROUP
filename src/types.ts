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
}

export type ActiveScreen = 
  | 'splash' 
  | 'auth' 
  | 'verify' 
  | 'dashboard' 
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
  isPrimary?: boolean;
  isSecondary?: boolean;
}

export type EmergencyEventType = 
  | 'manual_sos' 
  | 'crash' 
  | 'fall' 
  | 'soberband' 
  | 'critical_health' 
  | 'backend_command'
  | 'voice_emergency';

export type EmergencyState =
  | 'NORMAL'
  | 'EMERGENCY_DETECTED'
  | 'COUNTDOWN'
  | 'CANCELLED'
  | 'CONFIRMED_EMERGENCY'
  | 'GET_LOCATION'
  | 'LOG_EVENT'
  | 'CALL_CONTACT';

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
  callStatus: 'pending' | 'success' | 'simulated' | 'failed' | 'cancelled';
  callMode?: 'ACTION_CALL' | 'ACTION_DIAL' | 'TEST_SIMULATED' | 'WEB_TEL';
  notes?: string;
  backendLogged: boolean;
  testMode?: boolean;
  recognizedText?: string;
}

export interface EmergencySettingsConfig {
  primaryContact: EmergencyContact | null;
  secondaryContact: EmergencyContact | null;
  emergencyServiceNumber: string; // Default: '112' for Rwanda
  sosCountdownSeconds: number; // Default: 10
  autoCountdownSeconds: number; // Default: 15
  crashDetectionEnabled: boolean; // Default: true
  fallDetectionEnabled: boolean; // Default: true
  crashSensitivity: 'low' | 'medium' | 'high'; // Default: 'medium'
  isTestMode: boolean; // Default: false (true for dev testing)
}

export interface NotificationPreferences {
  pushEnabled: boolean;
  emailEnabled: boolean;
  dangerAlertsEnabled: boolean;
  highCautionAlerts: boolean;
  soundEnabled: boolean;
}

export type Language = 'en' | 'rw' | 'sw' | 'fr';

export type VoiceIntent =
  | 'NORMAL_CONVERSATION'
  | 'EMERGENCY_REQUEST'
  | 'CALL_PRIMARY_CONTACT'
  | 'CALL_SECONDARY_CONTACT'
  | 'CANCEL_EMERGENCY'
  | 'CHECK_HEALTH'
  | 'CHECK_DRIVING_READINESS'
  | 'CHECK_ALCOHOL_STATUS'
  | 'CHECK_LOCATION'
  | 'HELP'
  | 'UNKNOWN_COMMAND';

export type VoiceAssistantStatus = 
  | 'idle' 
  | 'listening' 
  | 'recognizing' 
  | 'processing' 
  | 'speaking' 
  | 'error';

export interface VoiceIntentMatch {
  intent: VoiceIntent;
  confidence: number;
  rawText: string;
  normalizedText: string;
  detectedLanguage: Language;
  extractedEntity?: {
    contactTarget?: string;
    contactName?: string;
    contactPhone?: string;
    action?: string;
  };
  speechResponse: string;
}

export interface VoiceAssistantConfig {
  primaryLanguage: Language;
  wakeWordEnabled: boolean; // "SoberWatch"
  continuousListening: boolean;
  autoSpeakResponse: boolean;
  voicePitch: number;
  voiceRate: number;
  countdownSeconds: number;
}
