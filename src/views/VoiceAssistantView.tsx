import React, { useState, useEffect } from 'react';
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
  Globe
} from 'lucide-react';
import { 
  Language, 
  VoiceAssistantStatus, 
  VoiceIntentMatch, 
  EmergencyState, 
  EmergencyContact, 
  TelemetryReading 
} from '../types';
import { translations } from '../i18n/translations';
import { voiceService } from '../services/voiceService';
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

  const [voiceState, setVoiceState] = useState({
    status: 'idle' as VoiceAssistantStatus,
    transcript: '',
    interimTranscript: '',
    lastRecognizedText: '',
    lastIntent: null as VoiceIntentMatch | null,
    lastAssistantSpeech: '',
    errorMessage: null as string | null,
    isMuted: false,
    isAvailable: true,
    wakeWordActive: false,
  });

  const [emergencyState, setEmergencyState] = useState<{
    state: EmergencyState;
    secondsRemaining: number;
  }>({
    state: emergencyService.getState(),
    secondsRemaining: 0,
  });

  const [testInputText, setTestInputText] = useState('');
  const [activeTab, setActiveTab] = useState<'assistant' | 'testSuite' | 'guide'>('assistant');
  const [testLogs, setTestLogs] = useState<Array<{ text: string; intent: string; confidence: number; time: string }>>([]);

  useEffect(() => {
    // Provide live context getters to voiceService
    voiceService.setContextGetters(
      () => primaryContact,
      () => secondaryContact,
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
      ...prev.slice(0, 9),
    ]);
  };

  const handleReplaySpeech = () => {
    if (voiceState.lastAssistantSpeech) {
      voiceService.speak(voiceState.lastAssistantSpeech, currentLanguage);
    }
  };

  const isEmergencyActive = emergencyState.state === 'COUNTDOWN' || emergencyState.state === 'EMERGENCY_DETECTED';

  // Quick Command Chips tailored per selected language with Kinyarwanda primacy
  const quickCommands = [
    { label: 'Ndababaye, hamagara ubutabazi', kiny: 'Ndababaye, hamagara ubutabazi', desc: 'Emergency SOS Call', isEmergency: true },
    { label: 'Hamagara Mama', kiny: 'Hamagara Mama', desc: 'Call Primary Contact', isCall: true },
    { label: 'Hagarika', kiny: 'Hagarika', desc: 'Cancel Emergency / Stop', isCancel: true },
    { label: 'Reba ubuzima bwanjye', kiny: 'Reba ubuzima bwanjye', desc: 'Check Biometrics', isHealth: true },
    { label: 'Nshobora gutwara imodoka?', kiny: 'Nshobora gutwara imodoka?', desc: 'Driving Readiness', isCheck: true },
    { label: 'Igipimo cy\'inzoga ni ikihe?', kiny: 'Igipimo cy\'inzoga ni ikihe?', desc: 'Check Alcohol / BAC', isCheck: true },
    { label: 'Aho ndi ni he?', kiny: 'Aho ndi ni he?', desc: 'Check GPS Location', isCheck: true },
    { label: 'Ubufasha', kiny: 'Ubufasha', desc: 'Help & Commands', isHelp: true },
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
                Kinyarwanda AI
              </span>
            </div>
            <p className="text-xs text-neutral-400">
              {t.voiceAssistantSubtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* Language Switcher */}
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
            title={voiceState.isMuted ? t.voiceUnmuted : t.voiceMuted}
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

      {/* Emergency Active Warning Banner (When in countdown or calling) */}
      {isEmergencyActive && (
        <div id="voice-emergency-banner" className="p-4 rounded-2xl bg-red-950/90 border-2 border-red-500 text-red-100 flex flex-col sm:flex-row items-center justify-between gap-3 animate-pulse shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center text-white shrink-0">
              <ShieldAlert className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <p className="font-bold text-sm text-red-200">
                {t.sosActiveTitle} ({emergencyState.secondsRemaining}s)
              </p>
              <p className="text-xs text-red-300">
                {t.voiceSayCancelToStop}
              </p>
            </div>
          </div>
          <button
            id="voice-abort-emergency-btn"
            onClick={() => voiceService.simulateVoiceCommand('Hagarika', currentLanguage)}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase tracking-wider transition-all"
          >
            {t.cancelEmergency}
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div id="voice-nav-tabs" className="flex bg-neutral-900/60 p-1 rounded-xl border border-neutral-800/80">
        <button
          id="tab-voice-assistant"
          onClick={() => setActiveTab('assistant')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
            activeTab === 'assistant'
              ? 'bg-amber-500 text-neutral-950 shadow-md font-bold'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Mic className="w-3.5 h-3.5" />
          <span>Voice AI Assistant</span>
        </button>

        <button
          id="tab-voice-test-suite"
          onClick={() => setActiveTab('testSuite')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
            activeTab === 'testSuite'
              ? 'bg-amber-500 text-neutral-950 shadow-md font-bold'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>{t.voiceTestModeTitle}</span>
        </button>

        <button
          id="tab-voice-guide"
          onClick={() => setActiveTab('guide')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
            activeTab === 'guide'
              ? 'bg-amber-500 text-neutral-950 shadow-md font-bold'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>{t.voiceHelpTitle}</span>
        </button>
      </div>

      {/* Main Assistant Tab */}
      {activeTab === 'assistant' && (
        <div className="space-y-5">
          {/* Visual Voice Center Card */}
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
              {/* Pulsing Outer Rings */}
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
                className={`relative w-24 h-24 sm:w-28 sm:h-28 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all duration-300 transform active:scale-95 ${
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
                 voiceState.status === 'error' ? 'Audio Notice' : t.voiceTapToSpeak}
              </span>

              {voiceState.errorMessage && (
                <p className="text-xs text-red-400 max-w-md pt-2">
                  {voiceState.errorMessage}
                </p>
              )}
            </div>

            {/* Live Interim Transcript Display */}
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
                  Live Voice Interaction
                </span>

                {voiceState.lastIntent && (
                  <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                    voiceState.lastIntent.intent === 'EMERGENCY_REQUEST' || voiceState.lastIntent.intent === 'CALL_PRIMARY_CONTACT'
                      ? 'bg-red-500/20 text-red-300 border-red-500/30'
                      : voiceState.lastIntent.intent === 'CANCEL_EMERGENCY'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  }`}>
                    {voiceState.lastIntent.intent.replace(/_/g, ' ')} ({Math.round(voiceState.lastIntent.confidence * 100)}%)
                  </span>
                )}
              </div>

              {/* Spoken Text Bubble */}
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

              {/* Assistant Response Bubble */}
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
                        className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 font-semibold"
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
                {t.voiceQuickPhrases}
              </h2>
              <span className="text-[11px] text-neutral-500">Tap to test voice dispatch</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {quickCommands.map((cmd, idx) => (
                <button
                  key={idx}
                  id={`voice-quick-cmd-${idx}`}
                  onClick={() => handleSimulateCommand(cmd.kiny)}
                  className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between group ${
                    cmd.isEmergency
                      ? 'bg-red-950/30 hover:bg-red-900/40 border-red-500/40 text-red-200'
                      : cmd.isCancel
                      ? 'bg-emerald-950/30 hover:bg-emerald-900/40 border-emerald-500/40 text-emerald-200'
                      : cmd.isCall
                      ? 'bg-amber-950/30 hover:bg-amber-900/40 border-amber-500/40 text-amber-200'
                      : 'bg-neutral-900 hover:bg-neutral-800/80 border-neutral-800 text-neutral-200'
                  }`}
                >
                  <div className="pr-2">
                    <p className="text-xs sm:text-sm font-bold text-white group-hover:text-amber-300 transition-colors">
                      "{cmd.label}"
                    </p>
                    <p className="text-[11px] text-neutral-400">{cmd.desc}</p>
                  </div>
                  <div className="w-7 h-7 rounded-lg bg-neutral-800/80 flex items-center justify-center text-neutral-400 group-hover:text-amber-400 shrink-0">
                    <Play className="w-3.5 h-3.5" />
                  </div>
                </button>
              ))}
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
                {t.voiceTestModeTitle}
              </h2>
              <p className="text-xs text-neutral-400 mt-1">
                {t.voiceTestModeDesc}
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
                placeholder="Type command (e.g. 'Ndababaye cyane, nkeneye ubutabazi')..."
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500"
              />
              <button
                id="voice-submit-sim-btn"
                onClick={() => {
                  if (testInputText.trim()) {
                    handleSimulateCommand(testInputText.trim());
                    setTestInputText('');
                  }
                }}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs flex items-center gap-1.5 transition-all"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Simulate</span>
              </button>
            </div>

            {/* Quick Simulation Buttons Grid */}
            <div className="space-y-2 pt-2">
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
                Preset Test Scenarios
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  id="test-btn-emergency-rw"
                  onClick={() => handleSimulateCommand('Ndababaye, hamagara ubutabazi nonaha')}
                  className="p-2.5 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-500/50 text-left text-xs text-red-200 font-semibold"
                >
                  🔴 Kinyarwanda: "Ndababaye, hamagara ubutabazi"
                </button>
                <button
                  id="test-btn-emergency-en"
                  onClick={() => handleSimulateCommand('I have had an accident, call emergency')}
                  className="p-2.5 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-500/50 text-left text-xs text-red-200 font-semibold"
                >
                  🔴 English: "I had an accident, call emergency"
                </button>
                <button
                  id="test-btn-cancel-rw"
                  onClick={() => handleSimulateCommand('Hagarika')}
                  className="p-2.5 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-500/50 text-left text-xs text-emerald-200 font-semibold"
                >
                  🟢 Kinyarwanda: "Hagarika" (Cancel Emergency)
                </button>
                <button
                  id="test-btn-call-mom"
                  onClick={() => handleSimulateCommand('Hamagara Mama')}
                  className="p-2.5 rounded-xl bg-amber-950/40 hover:bg-amber-900/60 border border-amber-500/50 text-left text-xs text-amber-200 font-semibold"
                >
                  🟡 Kinyarwanda: "Hamagara Mama" (Primary Call)
                </button>
                <button
                  id="test-btn-health"
                  onClick={() => handleSimulateCommand('Reba ubuzima bwanjye')}
                  className="p-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-left text-xs text-neutral-200 font-semibold"
                >
                  🔵 "Reba ubuzima bwanjye" (Biometrics)
                </button>
                <button
                  id="test-btn-driving"
                  onClick={() => handleSimulateCommand('Nshobora gutwara imodoka?')}
                  className="p-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-left text-xs text-neutral-200 font-semibold"
                >
                  🔵 "Nshobora gutwara imodoka?" (Driving Safe)
                </button>
              </div>
            </div>

            {/* Test Classification Logs Table */}
            {testLogs.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-neutral-800">
                <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
                  Test Results Log
                </p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {testLogs.map((log, idx) => (
                    <div key={idx} className="p-2.5 rounded-lg bg-neutral-800/80 border border-neutral-700 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-semibold text-white">"{log.text}"</span>
                        <span className="text-neutral-400 text-[10px] block">{log.time}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-amber-400 text-[11px] block">
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
            {t.voiceHelpTitle}
          </h2>
          <div className="space-y-3 leading-relaxed">
            <div className="p-3.5 rounded-xl bg-neutral-800/60 border border-neutral-700 space-y-1">
              <p className="font-bold text-white">1. Guhamagara Ubutabazi (Emergency Calling)</p>
              <p className="text-neutral-400">
                Vuga: <span className="text-amber-300 font-semibold">"Ndababaye"</span> cyangwa <span className="text-amber-300 font-semibold">"Hamagara ubutabazi"</span>. SoberWatch ihita itangiza amasegonda 10 yo kwitegura guhamagara kuri 112 cyangwa umuntu wanjye.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-neutral-800/60 border border-neutral-700 space-y-1">
              <p className="font-bold text-white">2. Guhagarika Ubutabazi (Voice Cancellation)</p>
              <p className="text-neutral-400">
                Muri ya masegonda 10, vuga: <span className="text-emerald-300 font-semibold">"Hagarika"</span>, <span className="text-emerald-300 font-semibold">"Reka"</span>, cyangwa <span className="text-emerald-300 font-semibold">"Cancel"</span>. Guhamagara bihita bihagarara ako kanya.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-neutral-800/60 border border-neutral-700 space-y-1">
              <p className="font-bold text-white">3. Guhamagara Umuntu Wihariye (Personal Contact)</p>
              <p className="text-neutral-400">
                Vuga: <span className="text-amber-300 font-semibold">"Hamagara Mama"</span>, <span className="text-amber-300 font-semibold">"Hamagara Manager"</span>, cyangwa <span className="text-amber-300 font-semibold">"Hamagara umuntu wanjye"</span>.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-neutral-800/60 border border-neutral-700 space-y-1">
              <p className="font-bold text-white">4. Kureba Ubuzima n'Inzoga (Vitals & BAC)</p>
              <p className="text-neutral-400">
                Vuga: <span className="text-blue-300 font-semibold">"Reba ubuzima bwanjye"</span> cyangwa <span className="text-blue-300 font-semibold">"Nshobora gutwara imodoka?"</span>.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
