import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  PhoneCall, 
  ShieldAlert, 
  Activity, 
  Navigation, 
  RotateCcw, 
  Sparkles, 
  Send, 
  CheckCircle2, 
  AlertTriangle,
  Play,
  Settings,
  HelpCircle,
  Radio,
  Zap,
  Globe,
  Terminal,
  Cpu,
  RefreshCw,
  Sliders
} from 'lucide-react';
import { 
  Language, 
  VoiceAssistantStatus, 
  VoiceIntentMatch, 
  EmergencyState, 
  EmergencyContact, 
  TelemetryReading,
  VoiceDiagnosticsState,
  VoiceErrorCode
} from '../types';
import { translations } from '../i18n/translations';
import { voiceService, VoiceServiceState } from '../services/voiceService';
import { emergencyService } from '../services/emergencyService';

interface VoiceAssistantViewProps {
  currentLanguage: Language;
  onLanguageChange: (lang: Language) => void;
  primaryContact: EmergencyContact | null;
  secondaryContact: EmergencyContact | null;
  currentReading: TelemetryReading | null;
  onNavigateToSettings: () => void;
}

export const VoiceAssistantView: React.FC<VoiceAssistantViewProps> = ({
  currentLanguage,
  onLanguageChange,
  primaryContact,
  secondaryContact,
  currentReading,
  onNavigateToSettings
}) => {
  const t = translations[currentLanguage] || translations.en;

  const [voiceState, setVoiceState] = useState<VoiceServiceState>({
    status: 'idle',
    transcript: '',
    interimTranscript: '',
    lastRecognizedText: '',
    lastIntent: null,
    lastAssistantSpeech: '',
    errorMessage: null,
    errorCode: null,
    isMuted: false,
    isAvailable: true,
    wakeWordActive: false,
    diagnostics: {
      micStatus: 'idle',
      sttStatus: 'idle',
      ttsStatus: 'idle',
      lastTranscript: '',
      detectedLanguage: 'rw',
      lastIntent: null,
      lastTool: null,
      errorCode: null,
      logs: [],
    },
  });

  const [emergencyState, setEmergencyState] = useState<{
    state: EmergencyState;
    secondsRemaining: number;
  }>({
    state: emergencyService.getState(),
    secondsRemaining: 0,
  });

  const [testInputText, setTestInputText] = useState('');
  const [activeTab, setActiveTab] = useState<'assistant' | 'diagnostics' | 'testSuite' | 'guide'>('assistant');
  const [testLogs, setTestLogs] = useState<Array<{ text: string; intent: string; confidence: number; time: string }>>([]);

  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Provide live context getters to voiceService
    voiceService.setContextGetters(
      () => {
        const list = [];
        if (primaryContact) list.push(primaryContact);
        if (secondaryContact) list.push(secondaryContact);
        return list;
      },
      () => currentReading
    );

    const unsubscribeVoice = voiceService.subscribe((state) => {
      setVoiceState(state);
    });

    const unsubscribeEmergency = emergencyService.subscribe((state, _event, secondsRemaining) => {
      setEmergencyState({
        state,
        secondsRemaining,
      });
    });

    return () => {
      unsubscribeVoice();
      unsubscribeEmergency();
    };
  }, [primaryContact, secondaryContact, currentReading]);

  const handleToggleListening = async () => {
    await voiceService.toggleListening();
  };

  const handleToggleMute = () => {
    voiceService.toggleMute();
  };

  const handleSimulateCommand = async (command: string) => {
    const res = await voiceService.simulateVoiceCommand(command, currentLanguage);
    setTestLogs((prev) => [
      {
        text: command,
        intent: res.intent,
        confidence: res.confidence,
        time: new Date().toLocaleTimeString(),
      },
      ...prev.slice(0, 19),
    ]);
  };

  const handleReplaySpeech = () => {
    if (voiceState.lastAssistantSpeech) {
      voiceService.speak(voiceState.lastAssistantSpeech, currentLanguage);
    }
  };

  const isEmergencyActive = emergencyState.state === 'COUNTDOWN' || emergencyState.state === 'EMERGENCY_DETECTED';

  // Fast Test Commands per requirement
  const fastTestCommands = [
    { label: 'Reba uko meze.', cmd: 'Reba uko meze.', category: 'Health' },
    { label: 'Mbwira BAC yanjye.', cmd: 'Mbwira BAC yanjye.', category: 'Alcohol' },
    { label: 'Hamagara John.', cmd: 'Hamagara John.', category: 'Contact' },
    { label: 'Fata location yanjye.', cmd: 'Fata location yanjye.', category: 'Location' },
    { label: 'Show my daily report.', cmd: 'Show my daily report.', category: 'Report' },
    { label: 'Hamagara emergency contact.', cmd: 'Hamagara emergency contact.', category: 'Emergency' },
    { label: 'Hagarika.', cmd: 'Hagarika.', category: 'Cancel' },
  ];

  return (
    <div id="voice-assistant-view" className="w-full max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-5 pb-28">
      {/* Header Bar */}
      <div id="voice-header-card" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-neutral-900/90 border border-neutral-800 backdrop-blur-md shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-white tracking-wide">
                {t.voiceAssistantTitle}
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30 uppercase tracking-wider">
                Kinyarwanda Primacy
              </span>
            </div>
            <p className="text-xs text-neutral-400">
              STT → Gemini 3.7 Flash Reasoning → Multilingual TTS Pipeline
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* Language Selector */}
          <div className="flex items-center bg-neutral-800/80 border border-neutral-700/80 rounded-xl p-1">
            <Globe className="w-3.5 h-3.5 text-neutral-400 ml-1.5 mr-1" />
            {(['rw', 'en', 'fr', 'sw'] as Language[]).map((lang) => (
              <button
                key={lang}
                id={`voice-lang-btn-${lang}`}
                onClick={() => onLanguageChange(lang)}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                  currentLanguage === lang
                    ? 'bg-amber-500 text-neutral-950 shadow-sm'
                    : 'text-neutral-300 hover:text-white hover:bg-neutral-700/50'
                }`}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Mute Button */}
          <button
            id="voice-mute-toggle-btn"
            onClick={handleToggleMute}
            title={voiceState.isMuted ? 'Unmute Assistant Voice' : 'Mute Assistant Voice'}
            className={`p-2.5 rounded-xl border transition-all ${
              voiceState.isMuted
                ? 'bg-neutral-800 text-neutral-400 border-neutral-700'
                : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
            }`}
          >
            {voiceState.isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Emergency Active Warning Banner */}
      {isEmergencyActive && (
        <div id="voice-emergency-banner" className="p-4 rounded-2xl bg-red-950/90 border-2 border-red-500 text-red-100 flex flex-col sm:flex-row items-center justify-between gap-3 animate-pulse shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center text-white shrink-0">
              <ShieldAlert className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <p className="font-bold text-sm text-red-200">
                POSSIBLE EMERGENCY DETECTED ({emergencyState.secondsRemaining}s)
              </p>
              <p className="text-xs text-red-300">
                {t.voiceSayCancelToStop}
              </p>
            </div>
          </div>
          <button
            id="voice-abort-emergency-btn"
            onClick={() => voiceService.simulateVoiceCommand('Hagarika', currentLanguage)}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
          >
            {t.cancelEmergency}
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div id="voice-nav-tabs" className="grid grid-cols-2 sm:grid-cols-4 bg-neutral-900/60 p-1 rounded-xl border border-neutral-800/80 gap-1">
        <button
          id="tab-voice-assistant"
          onClick={() => setActiveTab('assistant')}
          className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'assistant'
              ? 'bg-amber-500 text-neutral-950 shadow-md font-bold'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Mic className="w-3.5 h-3.5" />
          <span>Voice AI</span>
        </button>

        <button
          id="tab-voice-diagnostics"
          onClick={() => setActiveTab('diagnostics')}
          className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'diagnostics'
              ? 'bg-amber-500 text-neutral-950 shadow-md font-bold'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Diagnostics</span>
        </button>

        <button
          id="tab-voice-test-suite"
          onClick={() => setActiveTab('testSuite')}
          className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'testSuite'
              ? 'bg-amber-500 text-neutral-950 shadow-md font-bold'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Test Suite</span>
        </button>

        <button
          id="tab-voice-guide"
          onClick={() => setActiveTab('guide')}
          className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'guide'
              ? 'bg-amber-500 text-neutral-950 shadow-md font-bold'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Commands</span>
        </button>
      </div>

      {/* Main Assistant Tab */}
      {activeTab === 'assistant' && (
        <div className="space-y-5">
          {/* Visual Voice Visualizer Card */}
          <div id="voice-visualizer-card" className="relative p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-neutral-900 to-neutral-950 border border-neutral-800 shadow-2xl flex flex-col items-center justify-center text-center overflow-hidden">
            {/* Background Glow */}
            <div className={`absolute -inset-2 rounded-3xl filter blur-3xl opacity-20 transition-all duration-700 pointer-events-none ${
              voiceState.status === 'listening' ? 'bg-amber-500 opacity-30' :
              voiceState.status === 'speaking' ? 'bg-emerald-500 opacity-30' :
              voiceState.status === 'error' ? 'bg-red-500 opacity-25' :
              'bg-blue-500 opacity-10'
            }`} />

            {/* Central Animated Mic Sphere */}
            <div className="relative mb-6">
              {voiceState.status === 'listening' && (
                <>
                  <div className="absolute -inset-4 rounded-full border-2 border-amber-500/40 animate-ping" />
                  <div className="absolute -inset-8 rounded-full border border-amber-500/20 animate-pulse" />
                </>
              )}

              {voiceState.status === 'speaking' && (
                <div className="absolute -inset-4 rounded-full border-2 border-emerald-500/40 animate-pulse" />
              )}

              <button
                id="voice-main-mic-btn"
                onClick={handleToggleListening}
                className={`relative w-24 h-24 sm:w-28 sm:h-28 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all duration-300 transform active:scale-95 cursor-pointer ${
                  voiceState.status === 'listening'
                    ? 'bg-gradient-to-tr from-amber-600 to-amber-400 text-neutral-950 shadow-amber-500/30 scale-105'
                    : voiceState.status === 'speaking'
                    ? 'bg-gradient-to-tr from-emerald-600 to-emerald-400 text-neutral-950 shadow-emerald-500/30'
                    : voiceState.status === 'error'
                    ? 'bg-gradient-to-tr from-red-600 to-red-400 text-white shadow-red-500/30'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-amber-400 border border-neutral-700'
                }`}
              >
                {voiceState.status === 'listening' ? (
                  <Mic className="w-10 h-10 animate-bounce" />
                ) : voiceState.status === 'speaking' ? (
                  <Volume2 className="w-10 h-10 animate-pulse" />
                ) : (
                  <Mic className="w-10 h-10" />
                )}
                <span className="text-[10px] font-bold mt-1 uppercase tracking-wider">
                  {voiceState.status === 'listening' ? 'Listening' :
                   voiceState.status === 'speaking' ? 'Speaking' :
                   voiceState.status === 'processing' ? 'Processing' : 'Tap to Talk'}
                </span>
              </button>
            </div>

            {/* Status State Label */}
            <div className="space-y-1">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                voiceState.status === 'listening'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : voiceState.status === 'speaking'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : voiceState.status === 'processing'
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                  : voiceState.status === 'error'
                  ? 'bg-red-500/20 text-red-300 border-red-500/40'
                  : 'bg-neutral-800 text-neutral-400 border-neutral-700'
              }`}>
                <span className={`w-2 h-2 rounded-full ${
                  voiceState.status === 'listening' ? 'bg-amber-400 animate-ping' :
                  voiceState.status === 'speaking' ? 'bg-emerald-400 animate-pulse' :
                  voiceState.status === 'error' ? 'bg-red-400' : 'bg-neutral-500'
                }`} />
                {voiceState.status === 'listening' ? t.voiceListening :
                 voiceState.status === 'recognizing' ? t.voiceRecognizing :
                 voiceState.status === 'processing' ? t.voiceProcessing :
                 voiceState.status === 'speaking' ? t.voiceSpeaking :
                 voiceState.status === 'error' ? (voiceState.errorCode || 'Voice Error') : t.voiceTapToSpeak}
              </span>

              {voiceState.errorMessage && (
                <p className="text-xs text-red-400 max-w-md pt-2">
                  {voiceState.errorMessage}
                </p>
              )}
            </div>

            {/* Live Interim Subtitles */}
            {voiceState.interimTranscript && (
              <div id="voice-interim-transcript" className="mt-4 px-4 py-2 rounded-xl bg-neutral-800/80 border border-neutral-700 text-amber-200 text-sm font-medium italic animate-pulse">
                "{voiceState.interimTranscript}"
              </div>
            )}
          </div>

          {/* Active Conversation & Intent Classification Card */}
          {(voiceState.lastRecognizedText || voiceState.lastAssistantSpeech) && (
            <div id="voice-conversation-card" className="p-4 sm:p-5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Spoken Dialog Stream
                </span>

                {voiceState.lastIntent && (
                  <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                    voiceState.lastIntent.intent === 'EMERGENCY_REQUEST' || voiceState.lastIntent.intent === 'CALL_PRIMARY_CONTACT' || voiceState.lastIntent.intent === 'CALL_CONTACT'
                      ? 'bg-red-500/20 text-red-300 border-red-500/30'
                      : voiceState.lastIntent.intent === 'CANCEL_EMERGENCY'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  }`}>
                    {voiceState.lastIntent.intent.replace(/_/g, ' ')} ({Math.round(voiceState.lastIntent.confidence * 100)}%)
                  </span>
                )}
              </div>

              {/* User Voice Bubble */}
              {voiceState.lastRecognizedText && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-xs font-bold text-neutral-300 shrink-0">
                    You
                  </div>
                  <div className="flex-1 bg-neutral-800/60 rounded-2xl rounded-tl-none p-3 border border-neutral-700/60">
                    <p className="text-sm text-white font-medium">
                      "{voiceState.lastRecognizedText}"
                    </p>
                  </div>
                </div>
              )}

              {/* Assistant Speech Bubble */}
              {voiceState.lastAssistantSpeech && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-xs font-bold text-amber-400 shrink-0">
                    AI
                  </div>
                  <div className="flex-1 bg-amber-950/30 rounded-2xl rounded-tl-none p-3 border border-amber-500/30">
                    <p className="text-sm text-amber-100 font-medium leading-relaxed">
                      {voiceState.lastAssistantSpeech}
                    </p>
                    <div className="mt-2 flex items-center justify-end">
                      <button
                        id="voice-replay-btn"
                        onClick={handleReplaySpeech}
                        className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 font-semibold cursor-pointer"
                      >
                        <Play className="w-3 h-3" /> Replay Speech
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Quick Voice Command Chips */}
          <div id="voice-quick-chips" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
                Fast Commands
              </h2>
              <span className="text-[11px] text-neutral-500">Tap to execute without microphone</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {fastTestCommands.map((cmd, idx) => (
                <button
                  key={idx}
                  id={`voice-quick-cmd-${idx}`}
                  onClick={() => handleSimulateCommand(cmd.cmd)}
                  className="p-3 rounded-xl border border-neutral-800 bg-neutral-900/80 hover:bg-neutral-800 hover:border-amber-500/40 text-left transition-all flex items-center justify-between group cursor-pointer"
                >
                  <div className="pr-2">
                    <p className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">
                      "{cmd.label}"
                    </p>
                    <span className="text-[10px] text-neutral-400">{cmd.category}</span>
                  </div>
                  <div className="w-6 h-6 rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-400 group-hover:text-amber-400 shrink-0">
                    <Play className="w-3 h-3" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Diagnostics Dashboard Tab */}
      {activeTab === 'diagnostics' && (
        <div id="voice-diagnostics-dashboard" className="space-y-5">
          {/* Real-time Status Board */}
          <div className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Terminal className="w-4 h-4 text-amber-400" />
                <span>Voice Pipeline Diagnostic Monitor</span>
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                LIVE
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
              <div className="p-3 rounded-xl bg-neutral-800/60 border border-neutral-700/60 space-y-1">
                <span className="text-[10px] text-neutral-400 block uppercase">MIC STATUS</span>
                <span className={`font-bold capitalize ${
                  voiceState.diagnostics.micStatus === 'active' ? 'text-emerald-400' :
                  voiceState.diagnostics.micStatus === 'denied' ? 'text-red-400' : 'text-neutral-300'
                }`}>
                  {voiceState.diagnostics.micStatus}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-neutral-800/60 border border-neutral-700/60 space-y-1">
                <span className="text-[10px] text-neutral-400 block uppercase">STT STATUS</span>
                <span className={`font-bold capitalize ${
                  voiceState.diagnostics.sttStatus === 'listening' ? 'text-amber-400' :
                  voiceState.diagnostics.sttStatus === 'success' ? 'text-emerald-400' :
                  voiceState.diagnostics.sttStatus === 'error' ? 'text-red-400' : 'text-neutral-300'
                }`}>
                  {voiceState.diagnostics.sttStatus}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-neutral-800/60 border border-neutral-700/60 space-y-1">
                <span className="text-[10px] text-neutral-400 block uppercase">TTS STATUS</span>
                <span className={`font-bold capitalize ${
                  voiceState.diagnostics.ttsStatus === 'speaking' ? 'text-emerald-400' :
                  voiceState.diagnostics.ttsStatus === 'generating' ? 'text-amber-400' : 'text-neutral-300'
                }`}>
                  {voiceState.diagnostics.ttsStatus}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-neutral-800/60 border border-neutral-700/60 space-y-1">
                <span className="text-[10px] text-neutral-400 block uppercase">LANGUAGE</span>
                <span className="font-bold text-amber-300 uppercase">
                  {voiceState.diagnostics.detectedLanguage || currentLanguage}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-neutral-800/60 border border-neutral-700/60 space-y-1 sm:col-span-2">
                <span className="text-[10px] text-neutral-400 block uppercase">LAST INTENT</span>
                <span className="font-bold text-white truncate block">
                  {voiceState.diagnostics.lastIntent?.intent || 'NONE'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-neutral-800/60 border border-neutral-700/60 space-y-1">
                <span className="text-[10px] text-neutral-400 block uppercase">LAST TOOL</span>
                <span className="font-bold text-amber-400 truncate block">
                  {voiceState.diagnostics.lastTool || 'NONE'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-neutral-800/60 border border-neutral-700/60 space-y-1">
                <span className="text-[10px] text-neutral-400 block uppercase">ERROR CODE</span>
                <span className={`font-bold truncate block ${
                  voiceState.diagnostics.errorCode ? 'text-red-400' : 'text-neutral-500'
                }`}>
                  {voiceState.diagnostics.errorCode || 'NONE'}
                </span>
              </div>
            </div>

            {/* Last Recognized Transcript Box */}
            <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 space-y-1">
              <span className="text-[10px] font-mono text-neutral-400 uppercase">LAST TRANSCRIPT:</span>
              <p className="text-xs text-white font-mono">
                {voiceState.diagnostics.lastTranscript || '(Waiting for voice utterance...)'}
              </p>
            </div>
          </div>

          {/* Diagnostic Log Console */}
          <div className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider font-mono">
                [VOICE] Real-time Diagnostics Log Stream
              </h3>
              <button
                onClick={() => handleSimulateCommand('Reba uko meze.')}
                className="text-[11px] text-amber-400 hover:underline flex items-center gap-1 cursor-pointer font-mono"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Test Cycle</span>
              </button>
            </div>

            <div 
              ref={logContainerRef}
              className="p-3 rounded-xl bg-black border border-neutral-800 font-mono text-[11px] text-emerald-400 space-y-1 max-h-60 overflow-y-auto"
            >
              {voiceState.diagnostics.logs.length === 0 ? (
                <span className="text-neutral-600">No logs captured yet. Tap microphone or run test suite.</span>
              ) : (
                voiceState.diagnostics.logs.map((log, i) => (
                  <div key={i} className="leading-relaxed">
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Developer Test Suite Tab */}
      {activeTab === 'testSuite' && (
        <div id="voice-test-suite" className="space-y-5">
          <div className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Direct Command Testing Suite</span>
              </h2>
              <p className="text-xs text-neutral-400 mt-1">
                Execute any multi-lingual phrase directly through the AI Reasoning Engine without using microphone hardware.
              </p>
            </div>

            {/* Custom Input Simulator */}
            <div className="flex gap-2">
              <input
                id="voice-custom-input"
                type="text"
                value={testInputText}
                onChange={(e) => setTestInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && testInputText.trim()) {
                    handleSimulateCommand(testInputText.trim());
                    setTestInputText('');
                  }
                }}
                placeholder="Type command (e.g. 'Reba heartbeat yanjye', 'Hamagara John')..."
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500 font-mono"
              />
              <button
                id="voice-submit-sim-btn"
                onClick={() => {
                  if (testInputText.trim()) {
                    handleSimulateCommand(testInputText.trim());
                    setTestInputText('');
                  }
                }}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Execute</span>
              </button>
            </div>

            {/* Test Classification Logs Table */}
            {testLogs.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-neutral-800">
                <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider font-mono">
                  Test Results ({testLogs.length})
                </p>
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {testLogs.map((log, idx) => (
                    <div key={idx} className="p-2.5 rounded-lg bg-neutral-800/80 border border-neutral-700 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-semibold text-white font-mono">"{log.text}"</span>
                        <span className="text-neutral-400 text-[10px] block font-mono">{log.time}</span>
                      </div>
                      <div className="text-right font-mono">
                        <span className="font-bold text-amber-400 text-[11px] block">
                          {log.intent}
                        </span>
                        <span className="text-[10px] text-neutral-400">
                          {Math.round(log.confidence * 100)}% confidence
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Guide Tab */}
      {activeTab === 'guide' && (
        <div id="voice-guide-view" className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4 text-xs sm:text-sm text-neutral-300">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-amber-400" />
            <span>Kinyarwanda & Multilingual Voice Command Reference</span>
          </h2>
          <div className="space-y-3 leading-relaxed">
            <div className="p-3.5 rounded-xl bg-neutral-800/60 border border-neutral-700 space-y-1">
              <p className="font-bold text-white">1. Guhamagara Ubutabazi (Emergency SOS)</p>
              <p className="text-neutral-400">
                Vuga: <span className="text-amber-300 font-semibold">"Ndababaye"</span>, <span className="text-amber-300 font-semibold">"Hamagara ubutabazi"</span>, cyangwa <span className="text-amber-300 font-semibold">"Nkeneye ubufasha bw'ubutabazi"</span>. SoberWatch ihita itangiza amasegonda 10 yo kwitegura guhamagara kuri 112 cyangwa umuntu wanjye.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-neutral-800/60 border border-neutral-700 space-y-1">
              <p className="font-bold text-white">2. Guhagarika Ubutabazi (Voice Cancellation)</p>
              <p className="text-neutral-400">
                Muri ya masegonda 10, vuga: <span className="text-emerald-300 font-semibold">"Hagarika"</span>, <span className="text-emerald-300 font-semibold">"Reka"</span>, <span className="text-emerald-300 font-semibold">"Oya nta kibazo"</span>, cyangwa <span className="text-emerald-300 font-semibold">"Cancel"</span>. Guhamagara bihita bihagarara ako kanya.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-neutral-800/60 border border-neutral-700 space-y-1">
              <p className="font-bold text-white">3. Guhamagara Umuntu Wihariye (Personal Contact)</p>
              <p className="text-neutral-400">
                Vuga: <span className="text-amber-300 font-semibold">"Hamagara John"</span>, <span className="text-amber-300 font-semibold">"Hamagara Mama"</span>, cyangwa <span className="text-amber-300 font-semibold">"John muhagare"</span>.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-neutral-800/60 border border-neutral-700 space-y-1">
              <p className="font-bold text-white">4. Kureba Ubuzima n'Inzoga (Vitals & BAC)</p>
              <p className="text-neutral-400">
                Vuga: <span className="text-blue-300 font-semibold">"Reba uko meze"</span>, <span className="text-blue-300 font-semibold">"Mbwira BAC yanjye"</span>, cyangwa <span className="text-blue-300 font-semibold">"Nshobora gutwara imodoka?"</span>.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-neutral-800/60 border border-neutral-700 space-y-1">
              <p className="font-bold text-white">5. Kureba Aho Uherereye (Location & Report)</p>
              <p className="text-neutral-400">
                Vuga: <span className="text-purple-300 font-semibold">"Fata location yanjye"</span> cyangwa <span className="text-purple-300 font-semibold">"Show my daily report"</span>.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
