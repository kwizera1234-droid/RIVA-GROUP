import { Language, ReadingStatus } from '../types';

export interface TranslationDictionary {
  appName: string;
  subtitle: string;
  currentBrac: string;
  statusSafe: string;
  statusCaution: string;
  statusDanger: string;
  realTimeTelemetry: string;
  last20Readings: string;
  sensorRaw: string;
  deviceId: string;
  heartRate: string;
  timestamp: string;
  connectionStatus: string;
  connected: string;
  disconnected: string;
  aiInsightTitle: string;
  analyzingTelemetry: string;
  insightSafe: string;
  insightCaution: string;
  insightDanger: string;
  insightWaiting: string;
  
  // Navigation
  dashboardTab: string;
  historyTab: string;
  alertsTab: string;
  settingsTab: string;
  voiceAssistantTab: string;
  menuTitle: string;
  menuSubtitle: string;
  quickMenu: string;
  closeMenu: string;

  // History Page
  historyTitle: string;
  historySubtitle: string;
  recordedReadings: string;
  noReadings: string;
  noReadingsDesc: string;
  refreshBtn: string;
  loadingHistory: string;
  errorLoading: string;

  // Alerts Page
  alertsTitle: string;
  alertsSubtitle: string;
  activeDangerAlert: string;
  activeDangerDesc: string;
  allClearTitle: string;
  allClearMsg: string;
  alertHistoryTitle: string;
  noAlertsRecorded: string;
  noAlertsRecordedDesc: string;
  dangerAlertTitle: string;
  dangerAlertMsg: string;

  // Auth & Verification
  googleLogin: string;
  guestLogin: string;
  or: string;
  login: string;
  register: string;
  processing: string;
  emailPlaceholder: string;
  passwordPlaceholder: string;
  haveAccount: string;
  noAccount: string;
  verifyTitle: string;
  verifySubtitle: string;
  verifyBtn: string;
  verifying: string;
  backToLogin: string;

  // Settings & Subpages
  settingsTitle: string;
  settingsSubtitle: string;
  profile: string;
  signOut: string;
  deviceInfo: string;
  telemetryProtocol: string;
  realtimePolling: string;
  backendUrl: string;
  firmwareIntegration: string;
  language: string;
  selectLanguage: string;
  themeAccent: string;
  gold: string;
  silver: string;
  backToSettings: string;

  // Settings Sub-Pages Menu items
  emergencyContactsTitle: string;
  emergencyContactsDesc: string;
  notificationsTitle: string;
  notificationsDesc: string;
  helpSupportTitle: string;
  helpSupportDesc: string;
  dataPrivacyTitle: string;
  dataPrivacyDesc: string;
  aboutTitle: string;
  aboutDesc: string;

  // Emergency Contacts Form & List
  addContact: string;
  editContact: string;
  deleteContact: string;
  saveContact: string;
  cancel: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  contactRelationship: string;
  noContacts: string;
  noContactsDesc: string;
  contactAddedSuccess: string;
  contactDeletedSuccess: string;

  // Notifications Page
  pushNotifications: string;
  pushNotificationsDesc: string;
  emailNotifications: string;
  emailNotificationsDesc: string;
  dangerAlertToggle: string;
  dangerAlertToggleDesc: string;
  cautionAlertToggle: string;
  cautionAlertToggleDesc: string;
  soundAlerts: string;
  soundAlertsDesc: string;
  notificationSaved: string;

  // Help & Support Page
  faqTitle: string;
  faq1Q: string;
  faq1A: string;
  faq2Q: string;
  faq2A: string;
  faq3Q: string;
  faq3A: string;
  contactSupportTitle: string;
  contactSupportDesc: string;
  sendSupportEmail: string;
  troubleshootingTitle: string;
  troubleshooting1: string;
  troubleshooting2: string;
  troubleshooting3: string;
  appUsageTitle: string;
  appUsageText: string;

  // Emergency SOS & Automated Calling
  sosButton: string;
  sosActiveTitle: string;
  sosCountdownText: string;
  cancelEmergency: string;
  emergencyCallStarting: string;
  emergencyCallInProgress: string;
  emergencyCallSuccess: string;
  emergencyCallFailed: string;
  emergencyLocationAcquired: string;
  emergencyLocationSearching: string;
  emergencyServiceRwanda: string;
  primaryEmergencyContact: string;
  secondaryEmergencyContact: string;
  emergencyServiceNumber: string;
  crashDetection: string;
  crashDetectionDesc: string;
  fallDetection: string;
  fallDetectionDesc: string;
  testMode: string;
  testModeDesc: string;
  testModeBadge: string;
  testEmergencyTrigger: string;
  testSosTrigger: string;
  emergencyHistoryTitle: string;
  noEmergencyHistory: string;
  noEmergencyHistoryDesc: string;
  viewOnGoogleMaps: string;
  callingMode: string;
  primaryBadge: string;
  secondaryBadge: string;
  setPrimary: string;
  setSecondary: string;
  phoneValidationErr: string;
  triggerSosPrompt: string;
  crashSensitivity: string;
  lowSensitivity: string;
  medSensitivity: string;
  highSensitivity: string;

  // Voice Assistant
  voiceAssistantTitle: string;
  voiceAssistantSubtitle: string;
  voiceListening: string;
  voiceRecognizing: string;
  voiceProcessing: string;
  voiceSpeaking: string;
  voiceTapToSpeak: string;
  voiceStopListening: string;
  voiceQuickPhrases: string;
  voiceWakeWordEnabled: string;
  voiceContinuousMode: string;
  voiceMuted: string;
  voiceUnmuted: string;
  voiceTestModeTitle: string;
  voiceTestModeDesc: string;
  voiceSimulateCommand: string;
  voiceIntentDetected: string;
  voiceConfidence: string;
  voiceMicrophonePermission: string;
  voiceMicrophoneRequired: string;
  voiceSayCancelToStop: string;
  voiceKinyarwandaPrimary: string;
  voiceHelpTitle: string;
  voiceHelpBody: string;

  // Data Privacy Page
  downloadData: string;
  downloadDataDesc: string;
  exportJson: string;
  exportCsv: string;
  clearCache: string;
  clearCacheDesc: string;
  clearBtn: string;
  clearedSuccess: string;
  downloadSuccess: string;
  privacyInfoTitle: string;
  privacyInfoBody: string;

  // About Page
  version: string;
  productDesc: string;
  hardwareSpecsTitle: string;
  hardwareSpecs: string;
  copyrightNotice: string;
}

export const translations: Record<Language, TranslationDictionary> = {
  // ==========================================
  // KINYARWANDA (PRIMARY) - CONCISE & PUNCHY
  // ==========================================
  rw: {
    appName: 'SoberWatch',
    subtitle: 'Umutekano n\'Ubuzima',
    currentBrac: 'Igipimo cy\'Inzoga (BrAC)',
    statusSafe: 'UMEZE NEZA',
    statusCaution: 'WITONDE',
    statusDanger: 'AKAGA / INZOGA NYINSHI',
    realTimeTelemetry: 'Ibipimo mu gihe nyacyo',
    last20Readings: 'Ibipimo 20 biheruka',
    sensorRaw: 'Sensor Raw',
    deviceId: 'Nimero y\'Igikoresho',
    heartRate: 'Umutima (BPM)',
    timestamp: 'Igihe',
    connectionStatus: 'Ihuza',
    connected: 'Byahujwe',
    disconnected: 'Ntibyahujwe',
    aiInsightTitle: 'Inama za AI',
    analyzingTelemetry: 'Gusesengura...',
    insightSafe: 'Umeze neza cyane. Igipimo cy\'inzoga kiri hasi, nta kibazo.',
    insightCaution: 'Igipimo cyazamutseho gato. Witonde kandi uruhuke.',
    insightDanger: 'Akaga gakomeye! Ntugatware imodoka. Kanda SOS niba ukeneye ubufasha.',
    insightWaiting: 'Gutegereza ibipimo...',

    dashboardTab: 'Ahabanza',
    historyTab: 'Amateka',
    alertsTab: 'Impuruza',
    settingsTab: 'Igenamiterere',
    voiceAssistantTab: 'Ijwi',
    menuTitle: 'SoberWatch Menu',
    menuSubtitle: 'Umutekano n\'Ubuzima',
    quickMenu: 'Menu yihuse',
    closeMenu: 'Funga',

    historyTitle: 'Amateka',
    historySubtitle: 'Urutonde rw\'ibipimo byose',
    recordedReadings: 'Ibipimo Byanditswe',
    noReadings: 'Nta bipimo birahari',
    noReadingsDesc: 'Ibipimo bizagaragara hano igikoresho gitangiye kohereza amakuru.',
    refreshBtn: 'Vugurura',
    loadingHistory: 'Gupakurura...',
    errorLoading: 'Habaye ikosa mu gupakurura',

    alertsTitle: 'Impuruza',
    alertsSubtitle: 'Amakuru y\'umutekano',
    activeDangerAlert: 'Impuruza y\'Akaga',
    activeDangerDesc: 'Igipimo cyarenze urugero ruteganyijwe. Witonde!',
    allClearTitle: 'Byose ni Sawa',
    allClearMsg: 'Nta mpuruza ihari. Umutekano wawe urinzwe.',
    alertHistoryTitle: 'Amateka y\'Impuruza',
    noAlertsRecorded: 'Nta mpuruza yanditswe',
    noAlertsRecordedDesc: 'Nta bibazo by\'akaga biraboneka.',
    dangerAlertTitle: 'Impuruza Ikomeye',
    dangerAlertMsg: 'Igipimo cyarenze urugero. SoberWatch iragucungira hafi.',

    googleLogin: 'Injira na Google',
    guestLogin: 'Injira nka Mushyitsi',
    or: 'CYANGWA',
    login: 'Injira',
    register: 'Iyandikishe',
    processing: 'Biri gutunganywa...',
    emailPlaceholder: 'Imeli (urugero: izina@urugero.rw)',
    passwordPlaceholder: 'Ijambobanga',
    haveAccount: 'Ufite konti? Injira',
    noAccount: 'Nta konti ufite? Iyandikishe',
    verifyTitle: 'Kwemeza Nimero',
    verifySubtitle: 'Injiza kode woherejwe',
    verifyBtn: 'Emeza',
    verifying: 'Biri kwemezwa...',
    backToLogin: 'Subira kwinjira',

    settingsTitle: 'Igenamiterere',
    settingsSubtitle: 'Genzura konti n\'igikoresho',
    profile: 'Konti Yanjye',
    signOut: 'Sohoka',
    deviceInfo: 'Amakuru y\'Igikoresho',
    telemetryProtocol: 'Uburyo bw\'Amakuru',
    realtimePolling: 'Gukurikirana buri kanya',
    backendUrl: 'Aderesi ya Server',
    firmwareIntegration: 'Firmware',
    language: 'Ururimi',
    selectLanguage: 'Hitamo Ururimi',
    themeAccent: 'Ibara ry\'Imiterere',
    gold: 'Zahabu (Gold)',
    silver: 'Ifeza (Silver)',
    backToSettings: 'Subira Inyuma',

    emergencyContactsTitle: 'Nimero z\'Ubutabazi',
    emergencyContactsDesc: 'Nimero zizahamagarwa mu gihe habaye impanuka cyangwa akaga',
    notificationsTitle: 'Impuruza n\'Amatangazo',
    notificationsDesc: 'Hitamo uko wakira ubutumwa',
    helpSupportTitle: 'Ubufasha',
    helpSupportDesc: 'Ibibazo bikunze kubazwa n\'amabwiriza',
    dataPrivacyTitle: 'Umutekano w\'Amakuru',
    dataPrivacyDesc: 'Genzura no gukuramo amakuru yawe',
    aboutTitle: 'Ibyerekeye',
    aboutDesc: 'Amakuru ya SoberWatch',

    addContact: 'Ongeraho Nimero',
    editContact: 'Hindura',
    deleteContact: 'Siba',
    saveContact: 'Bika',
    cancel: 'Hagarika',
    contactName: 'Izina',
    contactPhone: 'Telefoni (+250...)',
    contactEmail: 'Imeli',
    contactRelationship: 'Isano (Inshuti, Umuryango)',
    noContacts: 'Nta nimero y\'ubutabazi irashyirwamo',
    noContactsDesc: 'Shyiramo byibura nimero imwe ya SOS.',
    contactAddedSuccess: 'Nimero yabitswe neza.',
    contactDeletedSuccess: 'Nimero yasibwe.',

    pushNotifications: 'Ubutumwa bwo kuri Telefoni',
    pushNotificationsDesc: 'Kwakira ubutumwa ako kanya',
    emailNotifications: 'Ubutumwa bwa Imeli',
    emailNotificationsDesc: 'Kwakira impuruza kuri imeli',
    dangerAlertToggle: 'Impuruza z\'Akaga',
    dangerAlertToggleDesc: 'Kumenyeshwa igihe cyose igipimo cyazamutse',
    cautionAlertToggle: 'Impuruza z\'Iburira',
    cautionAlertToggleDesc: 'Kumenyeshwa igihe inzoga zitangiye kuzamuka',
    soundAlerts: 'Amajwi y\'Inzogera',
    soundAlertsDesc: 'Gukoresha inzogera mu gihe cy\'impanuka',
    notificationSaved: 'Ibyifuzo byabitswe.',

    faqTitle: 'Ibibazo Bikunze Kubazwa',
    faq1Q: 'Ese SoberWatch irinda impanuka ite?',
    faq1A: 'SoberWatch ipima inzoga mu mubiri n\'umutima, ikanareba niba habaye impanuka.',
    faq2Q: 'Guhagarika emergency bikorwa bite?',
    faq2A: 'Ufite amasegonda 10 yo gukanda "Hagarika" mbere y\'uko terefone ihamagara.',
    faq3Q: 'Ese amakuru yanjye arinzwe?',
    faq3A: 'Yego, amakuru yose arinzwe mu buryo bwizewe.',
    contactSupportTitle: 'Vugana natwe',
    contactSupportDesc: 'Ukeneye ubufasha? Twandikire.',
    sendSupportEmail: 'Ohereza Imeli',
    troubleshootingTitle: 'Gukemura Ibibazo',
    troubleshooting1: 'Reba ko Bluetooth ifunguye.',
    troubleshooting2: 'Emeza ko Telefoni ifite uruhushya rwa GPS.',
    troubleshooting3: 'Reba ko microphone ifite uruhushya.',
    appUsageTitle: 'Amabwiriza',
    appUsageText: 'SoberWatch igucungira hafi kugira ngo ikurinde impanuka.',

    sosButton: 'KANDA SOS / TABAZA',
    sosActiveTitle: 'UBUTABAZI BURIMO GUTABAZA!',
    sosCountdownText: 'Guhamagara bitangira mu masegonda:',
    cancelEmergency: 'HAGARIKA',
    emergencyCallStarting: 'Guhuza...',
    emergencyCallInProgress: 'Birimo guhamagara...',
    emergencyCallSuccess: 'Guhamagara byakunze!',
    emergencyCallFailed: 'Guhamagara ntibyakunze.',
    emergencyLocationAcquired: 'GPS yamenyekanye.',
    emergencyLocationSearching: 'Gushakisha GPS...',
    emergencyServiceRwanda: 'Polisi / Ubutabazi (112)',
    primaryEmergencyContact: 'Umuntu wa 1 w\'Ubutabazi',
    secondaryEmergencyContact: 'Umuntu wa 2 w\'Ubutabazi',
    emergencyServiceNumber: 'Ubutabazi bw\'Igihugu (112)',
    crashDetection: 'Gutahura Impanuka',
    crashDetectionDesc: 'Guhita utabaza habaye impanuka ikomeye',
    fallDetection: 'Gutahura Kugwa',
    fallDetectionDesc: 'Guhita utabaza umuntu aguye hasi',
    testMode: 'Gusuzuma (Test Mode)',
    testModeDesc: 'Gupima SOS nta guhamagara nyako',
    testModeBadge: 'TEST',
    testEmergencyTrigger: 'Pima Impanuka',
    testSosTrigger: 'Pima SOS',
    emergencyHistoryTitle: 'Amateka y\'Ubutabazi',
    noEmergencyHistory: 'Nta mpuruza zirabaho',
    noEmergencyHistoryDesc: 'Ibyabaye byose bizandikwa hano.',
    viewOnGoogleMaps: 'Reba kuri Google Maps',
    callingMode: 'Uburyo bwo Guhamagara',
    primaryBadge: 'NYAMUKURU',
    secondaryBadge: 'UWA KABIRI',
    setPrimary: 'Gira uwa Mbere',
    setSecondary: 'Gira uwa Kabiri',
    phoneValidationErr: 'Nimero ya telefoni ntabwo yuzuye.',
    triggerSosPrompt: 'Ese wemeza ko ushaka gutabaza nonaha?',
    crashSensitivity: 'Ubukana bw\'Impanuka',
    lowSensitivity: 'Gake',
    medSensitivity: 'Hagati',
    highSensitivity: 'Cyane',

    // Voice Assistant (if accessed)
    voiceAssistantTitle: 'Ijwi rya SoberWatch',
    voiceAssistantSubtitle: 'Gutegeka hakoreshejwe ijwi mu Kinyarwanda',
    voiceListening: 'Ndimo kumva...',
    voiceRecognizing: 'Gusesengura...',
    voiceProcessing: 'Gutunganya...',
    voiceSpeaking: 'Kuvuga...',
    voiceTapToSpeak: 'Kanda uvuge',
    voiceStopListening: 'Hagarika',
    voiceQuickPhrases: 'Amagambo Wakoresha',
    voiceWakeWordEnabled: 'Wake Word ("SoberWatch")',
    voiceContinuousMode: 'Kumva buri kanya',
    voiceMuted: 'Ijwi ryazimye',
    voiceUnmuted: 'Ijwi rifunguye',
    voiceTestModeTitle: 'Pima Ijwi',
    voiceTestModeDesc: 'Pima amagambo nta microphone',
    voiceSimulateCommand: 'Pima Itegeko',
    voiceIntentDetected: 'Intego',
    voiceConfidence: 'Kwizera',
    voiceMicrophonePermission: 'Uruhushya rwa Micro',
    voiceMicrophoneRequired: 'Uruhushya rwo gufata amajwi rurakenewe.',
    voiceSayCancelToStop: 'Vuga "Hagarika" uhagarike.',
    voiceKinyarwandaPrimary: 'Ikinyarwanda cy\'ibanze.',
    voiceHelpTitle: 'Uko Ukoresha Ijwi',
    voiceHelpBody: 'Ushobora kuvuga:\n• "Hamagara ubutabazi"\n• "Hamagara Mama"\n• "Hagarika"\n• "Igipimo cy\'inzoga ni ikihe?"',

    downloadData: 'Gukuramo Amakuru',
    downloadDataDesc: 'Kura amakuru muri JSON cyangwa CSV',
    exportJson: 'Kura muri JSON',
    exportCsv: 'Kura muri CSV',
    clearCache: 'Gusiba Ububiko',
    clearCacheDesc: 'Siba amakuru yose ya telefoni',
    clearBtn: 'Siba Byose',
    clearedSuccess: 'Ububiko bwasibwe.',
    downloadSuccess: 'Amakuru yakutwemo neza.',
    privacyInfoTitle: 'Uburenganzira bw\'Amakuru',
    privacyInfoBody: 'Amakuru yawe arinzwe kandi ntasangizwa abandi.',

    version: 'Verisiyo 3.2.0',
    productDesc: 'SoberWatch ni uburyo bwo gukurikirana ubuzima no kurinda impanuka mu Rwanda.',
    hardwareSpecsTitle: 'Ibisobanuro by\'Icyuma',
    hardwareSpecs: 'Sensor: Dual Optical MQ-3 / PPG Biometric. BLE 5.2. Native Android Intent: ACTION_CALL / ACTION_DIAL.',
    copyrightNotice: '© 2026 SoberWatch Ltd. Uburenganzira bwose burabitswe.'
  },

  // ==========================================
  // ENGLISH
  // ==========================================
  en: {
    appName: 'SoberWatch',
    subtitle: 'Biometric Telemetry & Safety Suite',
    currentBrac: 'Current Breath Alcohol Concentration (BrAC)',
    statusSafe: 'SAFE',
    statusCaution: 'CAUTION',
    statusDanger: 'DANGER / CRITICAL',
    realTimeTelemetry: 'Real-Time Biometric Telemetry',
    last20Readings: 'Last 20 Readings',
    sensorRaw: 'Sensor Raw',
    deviceId: 'Device Identifier',
    heartRate: 'Heart Rate (BPM)',
    timestamp: 'Timestamp',
    connectionStatus: 'Connection Status',
    connected: 'Hardware Connected',
    disconnected: 'Hardware Disconnected',
    aiInsightTitle: 'AI Safety Advisory',
    analyzingTelemetry: 'Analyzing telemetry stream...',
    insightSafe: 'Sobriety metrics optimal. Alcohol concentration is negligible. Fit for standard activity and driving.',
    insightCaution: 'Elevated alcohol telemetry detected. Reaction times may be impaired. Exercise caution and do not operate vehicles.',
    insightDanger: 'CRITICAL INTOXICATION LEVEL DETECTED. Immediate safety intervention required. Emergency SOS active.',
    insightWaiting: 'Awaiting real-time telemetry from SoberWatch sensors...',

    dashboardTab: 'Dashboard',
    historyTab: 'History',
    alertsTab: 'Alerts',
    settingsTab: 'Settings',
    voiceAssistantTab: 'AI Voice',
    menuTitle: 'SoberWatch Menu',
    menuSubtitle: 'Biometric & Emergency Suite',
    quickMenu: 'Quick Actions',
    closeMenu: 'Close Menu',

    historyTitle: 'Telemetry History',
    historySubtitle: 'Historical log of all recorded biometric readings',
    recordedReadings: 'Recorded Telemetry Readings',
    noReadings: 'No Telemetry Recorded',
    noReadingsDesc: 'Readings will be logged continuously as SoberWatch hardware transmits sensor packets.',
    refreshBtn: 'Refresh Log',
    loadingHistory: 'Loading telemetry log...',
    errorLoading: 'Failed to load telemetry history from server',

    alertsTitle: 'Safety Alerts & Incidents',
    alertsSubtitle: 'Real-time hazard notifications and automated triggers',
    activeDangerAlert: 'Active Critical Hazard Alert',
    activeDangerDesc: 'Biometric telemetry exceeds critical danger thresholds. Stay safe!',
    allClearTitle: 'All Biometric Parameters Normal',
    allClearMsg: 'No active critical alerts. Your sobriety and vitals are well within safe thresholds.',
    alertHistoryTitle: 'Incident & Alert Log',
    noAlertsRecorded: 'No Incidents Recorded',
    noAlertsRecordedDesc: 'No safety or emergency events have been triggered during this session.',
    dangerAlertTitle: 'Critical Intoxication Alert',
    dangerAlertMsg: 'Readings exceed statutory limits. SoberWatch emergency state active.',

    googleLogin: 'Sign in with Google',
    guestLogin: 'Continue as Guest',
    or: 'OR',
    login: 'Sign In',
    register: 'Create Account',
    processing: 'Processing...',
    emailPlaceholder: 'Enter your email address',
    passwordPlaceholder: 'Enter secure password',
    haveAccount: 'Already have an account? Sign in',
    noAccount: "Don't have an account? Register",
    verifyTitle: 'Two-Factor Verification',
    verifySubtitle: 'Enter the 6-digit confirmation code',
    verifyBtn: 'Verify Account',
    verifying: 'Verifying code...',
    backToLogin: 'Back to Sign In',

    settingsTitle: 'System Settings',
    settingsSubtitle: 'Configure hardware, emergency protocols, and account',
    profile: 'User Profile',
    signOut: 'Sign Out of Account',
    deviceInfo: 'Hardware & Firmware Info',
    telemetryProtocol: 'Telemetry Transmission Protocol',
    realtimePolling: 'Real-time Streaming Polling',
    backendUrl: 'Cloud Backend API URL',
    firmwareIntegration: 'Firmware Bridge & Hardware Interface',
    language: 'Application Language',
    selectLanguage: 'Choose Preferred Language',
    themeAccent: 'Aesthetic Theme Accent',
    gold: 'Classic Gold',
    silver: 'Modern Silver',
    backToSettings: 'Back to Settings',

    emergencyContactsTitle: 'Emergency Contacts & SOS',
    emergencyContactsDesc: 'Configure trusted contacts for automated emergency calling during crash or SOS events',
    notificationsTitle: 'Alerts & Notifications',
    notificationsDesc: 'Configure push alerts, warning sirens, and notification channels',
    helpSupportTitle: 'Help & Knowledge Base',
    helpSupportDesc: 'Frequently asked questions, troubleshooting steps, and technical support',
    dataPrivacyTitle: 'Data Privacy & Exports',
    dataPrivacyDesc: 'Export your recorded biometric telemetry or wipe local device cache',
    aboutTitle: 'About SoberWatch',
    aboutDesc: 'Version, hardware specifications, and regulatory compliance info',

    addContact: 'Add Emergency Contact',
    editContact: 'Edit Contact',
    deleteContact: 'Delete Contact',
    saveContact: 'Save Emergency Contact',
    cancel: 'Cancel',
    contactName: 'Contact Full Name',
    contactPhone: 'Phone Number (e.g. +250 788 000 000)',
    contactEmail: 'Email Address (optional)',
    contactRelationship: 'Relationship (e.g., Family, Manager, Doctor)',
    noContacts: 'No Emergency Contacts Configured',
    noContactsDesc: 'Please register at least one contact for automated emergency phone calls.',
    contactAddedSuccess: 'Emergency contact saved successfully.',
    contactDeletedSuccess: 'Emergency contact deleted.',

    pushNotifications: 'Push Notifications',
    pushNotificationsDesc: 'Receive instant alerts on your lock screen and notification shade',
    emailNotifications: 'Email Telemetry Reports',
    emailNotificationsDesc: 'Receive weekly summaries and incident reports via email',
    dangerAlertToggle: 'Critical Hazard Alarms',
    dangerAlertToggleDesc: 'Sound loud audio alarms when BAC reaches dangerous thresholds',
    cautionAlertToggle: 'Caution & Impairment Warnings',
    cautionAlertToggleDesc: 'Notify when alcohol concentration begins to rise above normal',
    soundAlerts: 'Siren & Audio Cues',
    soundAlertsDesc: 'Play high-frequency auditory alert tones during emergency countdown',
    notificationSaved: 'Notification preferences updated.',

    faqTitle: 'Frequently Asked Questions',
    faq1Q: 'How does SoberWatch prevent drunk driving accidents?',
    faq1A: 'SoberWatch continuously monitors blood alcohol concentration, vital signs, and motion. If a severe impact or critical intoxication is detected, it automatically initiates emergency calling.',
    faq2Q: 'Can I cancel an accidental emergency call?',
    faq2A: 'Yes, you have a 10-second window to tap "Cancel" or say "Cancel" / "Stop" / "Hagarika" via voice before the phone call is placed.',
    faq3Q: 'Is my health data secure?',
    faq3A: 'All telemetry is encrypted end-to-end and stored securely in compliance with strict privacy standards.',
    contactSupportTitle: 'Contact Support Team',
    contactSupportDesc: 'Need immediate technical assistance with your SoberWatch hardware?',
    sendSupportEmail: 'Email Technical Support',
    troubleshootingTitle: 'Hardware Troubleshooting',
    troubleshooting1: 'Ensure Bluetooth is enabled to pair with your SoberBand device.',
    troubleshooting2: 'Grant Phone and GPS permissions to enable automated emergency calling.',
    troubleshooting3: 'If microphone is not responding, check app permissions in Android Settings.',
    appUsageTitle: 'Operation Guidelines',
    appUsageText: 'Wear SoberWatch securely on your wrist for continuous biometric telemetry and safety monitoring.',

    sosButton: 'TRIGGER EMERGENCY SOS',
    sosActiveTitle: 'EMERGENCY SOS ACTIVE',
    sosCountdownText: 'Automatic emergency call placing in:',
    cancelEmergency: 'CANCEL EMERGENCY CALL',
    emergencyCallStarting: 'Initiating Phone Call...',
    emergencyCallInProgress: 'Emergency Call in Progress...',
    emergencyCallSuccess: 'Emergency Call Placed Successfully',
    emergencyCallFailed: 'Failed to place call. Check telephony service.',
    emergencyLocationAcquired: 'GPS coordinates locked.',
    emergencyLocationSearching: 'Acquiring GPS location telemetry...',
    emergencyServiceRwanda: 'Rwanda National Emergency (112)',
    primaryEmergencyContact: 'Primary Emergency Contact',
    secondaryEmergencyContact: 'Secondary Emergency Contact',
    emergencyServiceNumber: 'National Emergency Service Number (112)',
    crashDetection: 'Severe Crash Detection',
    crashDetectionDesc: 'Uses accelerometer telemetry to detect high-G vehicular collisions',
    fallDetection: 'Sudden Fall Detection',
    fallDetectionDesc: 'Detects sudden impact and loss of posture or consciousness',
    testMode: 'Developer Test Mode',
    testModeDesc: 'Simulate emergency workflows safely without dialing real emergency dispatch',
    testModeBadge: 'TEST MODE',
    testEmergencyTrigger: 'Simulate Crash Event',
    testSosTrigger: 'Simulate Manual SOS',
    emergencyHistoryTitle: 'Emergency Event History',
    noEmergencyHistory: 'No Emergency Events Recorded',
    noEmergencyHistoryDesc: 'Historical records of all SOS and automated crash calls will appear here.',
    viewOnGoogleMaps: 'View Coordinates on Google Maps',
    callingMode: 'Calling Protocol',
    primaryBadge: 'PRIMARY',
    secondaryBadge: 'BACKUP',
    setPrimary: 'Make Primary',
    setSecondary: 'Make Secondary',
    phoneValidationErr: 'Please enter a valid phone number with country code.',
    triggerSosPrompt: 'Are you sure you want to trigger the emergency SOS system immediately?',
    crashSensitivity: 'Collision Detection Sensitivity',
    lowSensitivity: 'Low',
    medSensitivity: 'Medium',
    highSensitivity: 'High',

    // Voice Assistant
    voiceAssistantTitle: 'SoberWatch AI Voice Assistant',
    voiceAssistantSubtitle: 'Multi-lingual Voice Safety & Emergency Calling with Kinyarwanda Primacy',
    voiceListening: 'Listening for command...',
    voiceRecognizing: 'Recognizing speech...',
    voiceProcessing: 'Processing intent...',
    voiceSpeaking: 'SoberWatch is speaking...',
    voiceTapToSpeak: 'Tap to Speak',
    voiceStopListening: 'Stop Listening',
    voiceQuickPhrases: 'Quick Natural Voice Commands',
    voiceWakeWordEnabled: 'Wake Word ("SoberWatch")',
    voiceContinuousMode: 'Continuous Listening Mode',
    voiceMuted: 'Voice responses muted',
    voiceUnmuted: 'Voice responses unmuted',
    voiceTestModeTitle: 'Voice AI Test Suite',
    voiceTestModeDesc: 'Simulate natural speech recognition and intent classification without microphone hardware',
    voiceSimulateCommand: 'Simulate Spoken Command',
    voiceIntentDetected: 'Detected Intent',
    voiceConfidence: 'Confidence',
    voiceMicrophonePermission: 'Microphone Permission (RECORD_AUDIO)',
    voiceMicrophoneRequired: 'Microphone permission is required to process voice commands and emergency triggers.',
    voiceSayCancelToStop: 'Say "Cancel", "Stop", or "Hagarika" to abort an emergency countdown.',
    voiceKinyarwandaPrimary: 'Optimized for Kinyarwanda, English, French, and Kiswahili.',
    voiceHelpTitle: 'Voice Assistant Commands',
    voiceHelpBody: 'Supported Commands:\n• "Ndababaye, hamagara ubutabazi" (Emergency SOS)\n• "Hamagara Mama" or "Call Primary Contact"\n• "Hagarika" or "Cancel" (Aborts active emergency)\n• "Reba ubuzima bwanjye" / "Check my health"\n• "Nshobora gutwara imodoka?" / "Can I drive?"\n• "What is my BAC?" / "Check alcohol status"',

    downloadData: 'Download Biometric Log',
    downloadDataDesc: 'Export your recorded telemetry log in JSON or CSV format',
    exportJson: 'Export JSON',
    exportCsv: 'Export CSV',
    clearCache: 'Wipe Device Cache',
    clearCacheDesc: 'Clear all cached telemetry and local logs from this device',
    clearBtn: 'Clear All Cache',
    clearedSuccess: 'Local cache cleared successfully.',
    downloadSuccess: 'Export downloaded successfully.',
    privacyInfoTitle: 'Data Protection Notice',
    privacyInfoBody: 'Your biometric information is processed locally and transmitted through secured encrypted channels.',

    version: 'Version 3.2.0 (Kinyarwanda Voice & Telephony Engine)',
    productDesc: 'SoberWatch is a comprehensive biometric safety and emergency response platform engineered for road safety and accident prevention in Rwanda.',
    hardwareSpecsTitle: 'Hardware Specifications',
    hardwareSpecs: 'SoberBand HW: Dual-channel MQ-3 gas sensor, Photoplethysmography (PPG) vitals, 3-axis accelerometer, Telephony ACTION_CALL bridge.',
    copyrightNotice: '© 2026 SoberWatch Ltd. All rights reserved.'
  },

  // ==========================================
  // FRENCH (FRANÇAIS)
  // ==========================================
  fr: {
    appName: 'SoberWatch',
    subtitle: 'Télémétrie Biométrique & Système d\'Urgence',
    currentBrac: 'Alcoolémie Actuelle dans l\'Air Expiré (BrAC)',
    statusSafe: 'SÉCURISÉ',
    statusCaution: 'ATTENTION',
    statusDanger: 'DANGER / CRITIQUE',
    realTimeTelemetry: 'Télémétrie Biométrique en Temps Réel',
    last20Readings: '20 Dernières Mesures',
    sensorRaw: 'Capteur Brut',
    deviceId: 'Identifiant de l\'Appareil',
    heartRate: 'Pouls Cardiaque (BPM)',
    timestamp: 'Horodatage',
    connectionStatus: 'État de Connexion',
    connected: 'Matériel Connecté',
    disconnected: 'Matériel Déconnecté',
    aiInsightTitle: 'Conseils de Sécurité IA',
    analyzingTelemetry: 'Analyse de la télémétrie...',
    insightSafe: 'Sobriété optimale. Aucune trace d\'alcool significative. Vous pouvez conduire en toute sécurité.',
    insightCaution: 'Taux d\'alcoolémie élevé. Réflexes potentiellement diminués. Ne prenez pas le volant.',
    insightDanger: 'ALERTE DANGER CRITIQUE! Risque élevé d\'accident. Assistance d\'urgence activée.',
    insightWaiting: 'En attente des données des capteurs SoberWatch...',

    dashboardTab: 'Tableau de bord',
    historyTab: 'Historique',
    alertsTab: 'Alertes',
    settingsTab: 'Paramètres',
    voiceAssistantTab: 'Assistant Vocal',
    menuTitle: 'Menu SoberWatch',
    menuSubtitle: 'Surveillance & Urgences',
    quickMenu: 'Actions Rapides',
    closeMenu: 'Fermer le Menu',

    historyTitle: 'Historique de Télémétrie',
    historySubtitle: 'Journal des mesures biométriques enregistrées',
    recordedReadings: 'Mesures Enregistrées',
    noReadings: 'Aucune mesure enregistrée',
    noReadingsDesc: 'Les données apparaîtront dès que le capteur SoberWatch transmettra des mesures.',
    refreshBtn: 'Actualiser',
    loadingHistory: 'Chargement de l\'historique...',
    errorLoading: 'Erreur lors du chargement de l\'historique',

    alertsTitle: 'Alertes et Incidents',
    alertsSubtitle: 'Notifications de danger et déclencheurs automatiques',
    activeDangerAlert: 'Alerte Danger Critique Active',
    activeDangerDesc: 'Les valeurs mesurées dépassent le seuil légal de sécurité.',
    allClearTitle: 'Tous les Paramètres sont Normaux',
    allClearMsg: 'Aucune alerte active. Vos constantes sont dans les normes de sécurité.',
    alertHistoryTitle: 'Historique des Alertes',
    noAlertsRecorded: 'Aucune alerte enregistrée',
    noAlertsRecordedDesc: 'Aucun événement critique n\'a été déclenché.',
    dangerAlertTitle: 'Alerte Intoxication Critique',
    dangerAlertMsg: 'Seuil de sécurité dépassé. Protocole d\'urgence SoberWatch enclenché.',

    googleLogin: 'Connexion avec Google',
    guestLogin: 'Continuer en Invité',
    or: 'OU',
    login: 'Se Connecter',
    register: 'Créer un Compte',
    processing: 'Traitement...',
    emailPlaceholder: 'Votre adresse e-mail',
    passwordPlaceholder: 'Mot de passe sécurisé',
    haveAccount: 'Vous avez un compte? Connectez-vous',
    noAccount: 'Pas de compte? Inscrivez-vous',
    verifyTitle: 'Vérification en Deux Étapes',
    verifySubtitle: 'Entrez le code de sécurité à 6 chiffres',
    verifyBtn: 'Vérifier le Compte',
    verifying: 'Vérification en cours...',
    backToLogin: 'Retour à la Connexion',

    settingsTitle: 'Paramètres Système',
    settingsSubtitle: 'Configuration du matériel et des numéros d\'urgence',
    profile: 'Profil Utilisateur',
    signOut: 'Se Déconnecter',
    deviceInfo: 'Informations Matériel',
    telemetryProtocol: 'Protocole de Transmission',
    realtimePolling: 'Synchronisation en continu',
    backendUrl: 'URL du Serveur Backend',
    firmwareIntegration: 'Interface Firmware & Capteurs',
    language: 'Langue de l\'Application',
    selectLanguage: 'Sélectionner la Langue',
    themeAccent: 'Thème Visuel',
    gold: 'Or Classique (Gold)',
    silver: 'Argent Moderne (Silver)',
    backToSettings: 'Retour aux Paramètres',

    emergencyContactsTitle: 'Contacts d\'Urgence & SOS',
    emergencyContactsDesc: 'Configurez les numéros à appeler automatiquement en cas d\'accident ou de SOS',
    notificationsTitle: 'Notifications & Alertes',
    notificationsDesc: 'Configurez les alertes push et les alarmes sonores',
    helpSupportTitle: 'Aide & Base de Connaissances',
    helpSupportDesc: 'Questions fréquentes, dépannage et support technique',
    dataPrivacyTitle: 'Confidentialité & Données',
    dataPrivacyDesc: 'Exportez vos données de santé ou effacez le cache local',
    aboutTitle: 'À Propos de SoberWatch',
    aboutDesc: 'Version de l\'application et spécifications techniques',

    addContact: 'Ajouter un Contact d\'Urgence',
    editContact: 'Modifier le Contact',
    deleteContact: 'Supprimer',
    saveContact: 'Enregistrer le Contact',
    cancel: 'Annuler',
    contactName: 'Nom Complet',
    contactPhone: 'Numéro de Téléphone (+250...)',
    contactEmail: 'Adresse E-mail (optionnelle)',
    contactRelationship: 'Lien de parenté / Relation',
    noContacts: 'Aucun contact d\'urgence configuré',
    noContactsDesc: 'Veuillez enregistrer au moins un numéro pour les appels de secours automatiques.',
    contactAddedSuccess: 'Contact d\'urgence enregistré.',
    contactDeletedSuccess: 'Contact d\'urgence supprimé.',

    pushNotifications: 'Notifications Push',
    pushNotificationsDesc: 'Recevoir les alertes sur votre écran de verrouillage',
    emailNotifications: 'Rapports par E-mail',
    emailNotificationsDesc: 'Recevoir des récapitulatifs hebdomadaires par e-mail',
    dangerAlertToggle: 'Alarmes de Danger Critique',
    dangerAlertToggleDesc: 'Déclencher une alarme sonore si le taux d\'alcool est critique',
    cautionAlertToggle: 'Avertissements d\'Attention',
    cautionAlertToggleDesc: 'Alerter dès que l\'alcoolémie commence à monter',
    soundAlerts: 'Sirène et Signaux Sonores',
    soundAlertsDesc: 'Jouer un signal sonore lors du compte à rebours de secours',
    notificationSaved: 'Préférences de notifications enregistrées.',

    faqTitle: 'Foire Aux Questions',
    faq1Q: 'Comment SoberWatch prévient-elle les accidents?',
    faq1A: 'SoberWatch analyse en continu votre alcoolémie et détecte les chocs violents pour appeler automatiquement les secours.',
    faq2Q: 'Comment annuler un appel de secours par erreur?',
    faq2A: 'Vous disposez d\'un compte à rebours de 10 secondes pour appuyer sur Annuler ou dire à voix haute "Annuler" / "Hagarika".',
    faq3Q: 'Mes données de santé sont-elles protégées?',
    faq3A: 'Oui, toutes les données sont chiffrées de bout en bout et protégées selon les normes de confidentialité les plus strictes.',
    contactSupportTitle: 'Contacter le Support',
    contactSupportDesc: 'Besoin d\'assistance technique pour votre appareil SoberWatch?',
    sendSupportEmail: 'Envoyer un E-mail au Support',
    troubleshootingTitle: 'Guide de Dépannage',
    troubleshooting1: 'Activez le Bluetooth pour connecter votre bracelet SoberBand.',
    troubleshooting2: 'Autorisez les permissions d\'appel et de localisation GPS.',
    troubleshooting3: 'Si la voix ne répond pas, vérifiez la permission du microphone (RECORD_AUDIO).',
    appUsageTitle: 'Guide d\'Utilisation',
    appUsageText: 'Portez le bracelet SoberWatch pour une surveillance biométrique et sécuritaire continue.',

    sosButton: 'DÉCLENCHER LE SOS D\'URGENCE',
    sosActiveTitle: 'SOS D\'URGENCE EN COURS',
    sosCountdownText: 'Appel d\'urgence automatique dans:',
    cancelEmergency: 'ANNULER L\'APPEL D\'URGENCE',
    emergencyCallStarting: 'Initialisation de l\'appel...',
    emergencyCallInProgress: 'Appel d\'urgence en cours...',
    emergencyCallSuccess: 'Appel d\'urgence effectué avec succès',
    emergencyCallFailed: 'Échec de l\'appel. Vérifiez le réseau téléphonique.',
    emergencyLocationAcquired: 'Coordonnées GPS enregistrées.',
    emergencyLocationSearching: 'Acquisition de la position GPS en cours...',
    emergencyServiceRwanda: 'Numéro d\'Urgence National du Rwanda (112)',
    primaryEmergencyContact: 'Contact d\'Urgence Principal',
    secondaryEmergencyContact: 'Contact d\'Urgence Secondaire',
    emergencyServiceNumber: 'Numéro d\'Urgence National (112)',
    crashDetection: 'Détection d\'Accident Violente (Crash)',
    crashDetectionDesc: 'Détecte les collisions violentes en voiture ou moto',
    fallDetection: 'Détection de Chute Lourde',
    fallDetectionDesc: 'Détecte les chutes brutales et la perte de conscience',
    testMode: 'Mode Test Développeur',
    testModeDesc: 'Tester le flux d\'urgence sans composer de vrai appel téléphonique',
    testModeBadge: 'MODE TEST',
    testEmergencyTrigger: 'Simuler un Accident',
    testSosTrigger: 'Simuler un SOS Manuel',
    emergencyHistoryTitle: 'Historique des Événements d\'Urgence',
    noEmergencyHistory: 'Aucun événement d\'urgence enregistré',
    noEmergencyHistoryDesc: 'L\'historique de tous les appels SOS apparaîtra ici.',
    viewOnGoogleMaps: 'Voir la Position sur Google Maps',
    callingMode: 'Mode d\'Appel Téléphonique',
    primaryBadge: 'PRINCIPAL',
    secondaryBadge: 'SECONDAIRE',
    setPrimary: 'Définir en Principal',
    setSecondary: 'Définir en Secondaire',
    phoneValidationErr: 'Veuillez saisir un numéro de téléphone valide avec indicatif.',
    triggerSosPrompt: 'Confirmez-vous le déclenchement immédiat de l\'alerte SOS?',
    crashSensitivity: 'Sensibilité de Détection des Chocs',
    lowSensitivity: 'Faible',
    medSensitivity: 'Moyenne',
    highSensitivity: 'Élevée',

    // Voice Assistant
    voiceAssistantTitle: 'Assistant Vocal IA SoberWatch',
    voiceAssistantSubtitle: 'Commandes vocales multilingues avec priorité au Kinyarwanda',
    voiceListening: 'À l\'écoute de votre voix...',
    voiceRecognizing: 'Reconnaissance vocale...',
    voiceProcessing: 'Traitement de la commande...',
    voiceSpeaking: 'SoberWatch parle...',
    voiceTapToSpeak: 'Appuyez pour Parler',
    voiceStopListening: 'Arrêter l\'Écoute',
    voiceQuickPhrases: 'Commandes Vocales Rapides',
    voiceWakeWordEnabled: 'Mot Clé d\'Activation ("SoberWatch")',
    voiceContinuousMode: 'Mode Écoute Continue',
    voiceMuted: 'Réponses vocales coupées',
    voiceUnmuted: 'Réponses vocales actives',
    voiceTestModeTitle: 'Suite de Test Vocal IA',
    voiceTestModeDesc: 'Testez la reconnaissance vocale et les intentions sans microphone physique',
    voiceSimulateCommand: 'Simuler une Commande Vocale',
    voiceIntentDetected: 'Intention Détectée',
    voiceConfidence: 'Niveau de Confiance',
    voiceMicrophonePermission: 'Permission Microphone (RECORD_AUDIO)',
    voiceMicrophoneRequired: 'La permission du microphone est requise pour utiliser l\'assistant vocal.',
    voiceSayCancelToStop: 'Dites "Annuler", "Stop" ou "Hagarika" pour stopper le compte à rebours d\'urgence.',
    voiceKinyarwandaPrimary: 'Optimisé pour le Kinyarwanda, l\'Anglais, le Français et le Swahili.',
    voiceHelpTitle: 'Commandes Vocales Disponibles',
    voiceHelpBody: 'Commandes suggérées:\n• "Ndababaye, hamagara ubutabazi" (Urgence SOS)\n• "Appelez les secours" ou "Je suis en danger"\n• "Appeler maman" ou "Appeler mon contact"\n• "Annuler" ou "Hagarika" (Arrête l\'urgence)\n• "Vérifier ma santé" ou "Puis-je conduire?"',

    downloadData: 'Télécharger les Données',
    downloadDataDesc: 'Exporter le journal télémétrique en format JSON ou CSV',
    exportJson: 'Exporter en JSON',
    exportCsv: 'Exporter en CSV',
    clearCache: 'Effacer le Cache Local',
    clearCacheDesc: 'Supprimer toutes les données enregistrées sur l\'appareil',
    clearBtn: 'Effacer le Cache',
    clearedSuccess: 'Cache local effacé avec succès.',
    downloadSuccess: 'Exportation téléchargée avec succès.',
    privacyInfoTitle: 'Protection de la Vie Privée',
    privacyInfoBody: 'Vos données biométriques restent strictement confidentielles et chiffrées.',

    version: 'Version 3.2.0 (Moteur Vocal Kinyarwanda & Téléphonie)',
    productDesc: 'SoberWatch est une plateforme de pointe pour la sécurité routière et la prévention des accidents liés à l\'alcool au Rwanda.',
    hardwareSpecsTitle: 'Spécifications Matérielles',
    hardwareSpecs: 'SoberBand HW: Capteur double optique MQ-3, Végétatif PPG, Accéléromètre 3-axes, Pont Téléphonie Native Android ACTION_CALL.',
    copyrightNotice: '© 2026 SoberWatch Ltd. Tous droits réservés.'
  },

  // ==========================================
  // KISWAHILI
  // ==========================================
  sw: {
    appName: 'SoberWatch',
    subtitle: 'Ufuatiliaji wa Afya na Usalama wa Dharura',
    currentBrac: 'Kiwango cha Pombe Kwenye Pumzi (BrAC)',
    statusSafe: 'SALAMA',
    statusCaution: 'TAHADHARI',
    statusDanger: 'HATARI / JUU SANA',
    realTimeTelemetry: 'Ufuatiliaji wa Moja kwa Moja',
    last20Readings: 'Vipimo 20 Vilivyopita',
    sensorRaw: 'Sensor Raw',
    deviceId: 'Nambari ya Kifaa',
    heartRate: 'Mapigo ya Moyo (BPM)',
    timestamp: 'Wakati',
    connectionStatus: 'Hali ya Muunganisho',
    connected: 'Kifaa Kimeunganishwa',
    disconnected: 'Kifaa Hakijaunganishwa',
    aiInsightTitle: 'Ushauri wa Usalama wa AI',
    analyzingTelemetry: 'Kuchambua vipimo vya afya...',
    insightSafe: 'Kiwango cha pombe kiko salama kabisa. Hakuna hatari katika kuendesha gari au shughuli za kawaida.',
    insightCaution: 'Kiwango cha pombe kimeongezeka. Tahadhari inahitajika, usiendelee kuendesha gari.',
    insightDanger: 'HATARI KUBWA YA POMBE! Usijaribu kuendesha gari. Mfumo wa dharura wa SOS umewashwa.',
    insightWaiting: 'Kusubiri data kutoka kwa sensor za SoberWatch...',

    dashboardTab: 'Dashibodi',
    historyTab: 'Historia',
    alertsTab: 'Tahadhari',
    settingsTab: 'Mipangilio',
    voiceAssistantTab: 'Sauti ya AI',
    menuTitle: 'Menyu ya SoberWatch',
    menuSubtitle: 'Ulinzi na Usalama wa Afya',
    quickMenu: 'Vitendo vya Haraka',
    closeMenu: 'Funga Menyu',

    historyTitle: 'Historia ya Vipimo',
    historySubtitle: 'Kumbukumbu ya vipimo vyote vya afya',
    recordedReadings: 'Vipimo Vilivyorekodiwa',
    noReadings: 'Hakuna vipimo vilivyorekodiwa',
    noReadingsDesc: 'Vipimo vitaonekana hapa mara tu kifaa cha SoberWatch kitakapoanza kutuma data.',
    refreshBtn: 'Sasisha',
    loadingHistory: 'Kupakia historia...',
    errorLoading: 'Imeshindwa kupakia historia ya vipimo',

    alertsTitle: 'Tahadhari za Usalama',
    alertsSubtitle: 'Taarifa za dharura na hatari',
    activeDangerAlert: 'Tahadhari ya Hatari Imewashwa',
    activeDangerDesc: 'Kiwango cha pombe kimevuka mipaka ya usalama. Kuwa makini!',
    allClearTitle: 'Vipimo Vyote Viko Salama',
    allClearMsg: 'Hakuna tahadhari ya hatari kwa sasa. Afya yako iko salama.',
    alertHistoryTitle: 'Historia ya Tahadhari',
    noAlertsRecorded: 'Hakuna tahadhari zilizorekodiwa',
    noAlertsRecordedDesc: 'Hakuna matukio ya hatari yaliyotokea.',
    dangerAlertTitle: 'Tahadhari ya Hatari Kubwa',
    dangerAlertMsg: 'Kiwango kimezidi kipimo salama. SoberWatch inalinda usalama wako.',

    googleLogin: 'Ingia kwa Google',
    guestLogin: 'Endelea kama Mgeni',
    or: 'AU',
    login: 'Ingia',
    register: 'Jisajili',
    processing: 'Inachakatwa...',
    emailPlaceholder: 'Barua pepe yako',
    passwordPlaceholder: 'Nenosiri salama',
    haveAccount: 'Una akaunti tayari? Ingia hapa',
    noAccount: 'Huna akaunti? Jisajili hapa',
    verifyTitle: 'Uthibitishaji wa Hatua Mbili',
    verifySubtitle: 'Weka nambari ya siri ya uthibitishaji',
    verifyBtn: 'Thibitisha Akaunti',
    verifying: 'Inathibitishwa...',
    backToLogin: 'Rudi Kwenye Kuingia',

    settingsTitle: 'Mipangilio ya Mfumo',
    settingsSubtitle: 'Sanidi akaunti na mfumo wa dharura',
    profile: 'Akaunti Yangu',
    signOut: 'Ondoka Kwenye Akaunti',
    deviceInfo: 'Taarifa za Kifaa',
    telemetryProtocol: 'Itifaki ya Mawasiliano',
    realtimePolling: 'Ufuatiliaji wa Moja kwa Moja',
    backendUrl: 'Anwani ya Seva',
    firmwareIntegration: 'Muunganisho wa Firmware',
    language: 'Lugha ya Programu',
    selectLanguage: 'Chagua Lugha Unayotaka',
    themeAccent: 'Rangi ya Muonekano',
    gold: 'Dhahabu (Classic Gold)',
    silver: 'Fedha (Modern Silver)',
    backToSettings: 'Rudi Kwenye Mipangilio',

    emergencyContactsTitle: 'Watu wa Dharura & SOS',
    emergencyContactsDesc: 'Weka nambari za kupigiwa simu mara moja kukitokea ajali au dharura',
    notificationsTitle: 'Taarifa & Tahadhari',
    notificationsDesc: 'Sanidi ujumbe wa tahadhari na milio ya king\'ora',
    helpSupportTitle: 'Msaada & Maswali',
    helpSupportDesc: 'Maswali yanayoulizwa mara kwa mara na msaada wa kiufundi',
    dataPrivacyTitle: 'Faragha ya Data',
    dataPrivacyDesc: 'Pakua data yako ya afya au futa kumbukumbu ya kifaa',
    aboutTitle: 'Kuhusu SoberWatch',
    aboutDesc: 'Toleo la programu na maelezo ya kiufundi',

    addContact: 'Ongeza Mtu wa Dharura',
    editContact: 'Hariri Mtu',
    deleteContact: 'Futa',
    saveContact: 'Hifadhi Nambari',
    cancel: 'Ghairi',
    contactName: 'Jina Kamili',
    contactPhone: 'Nambari ya Simu (+250...)',
    contactEmail: 'Barua Pepe (hiari)',
    contactRelationship: 'Uhusiano (Familia, Rafiki, Bosi)',
    noContacts: 'Hakuna watu wa dharura waliowekwa',
    noContactsDesc: 'Tafadhali weka angalau nambari moja ya dharura itakayopigiwa simu kukitokea shida.',
    contactAddedSuccess: 'Nambari ya dharura imehifadhiwa.',
    contactDeletedSuccess: 'Nambari ya dharura imefutwa.',

    pushNotifications: 'Ujumbe wa Push',
    pushNotificationsDesc: 'Pokea taarifa za haraka kwenye kioo cha simu',
    emailNotifications: 'Ripoti kwa Barua Pepe',
    emailNotificationsDesc: 'Pokea muhtasari wa afya kwenye barua pepe',
    dangerAlertToggle: 'King\'ora cha Hatari',
    dangerAlertToggleDesc: 'Piga king\'ora wakati kiwango cha pombe kiko hatarini',
    cautionAlertToggle: 'Tahadhari ya Mapema',
    cautionAlertToggleDesc: 'Toa taarifa pale pombe inapoanza kupanda',
    soundAlerts: 'Sauti za Tahadhari',
    soundAlertsDesc: 'Tumia sauti wakati wa kuhesabu sekunde za dharura',
    notificationSaved: 'Mipangilio ya taarifa imehifadhiwa.',

    faqTitle: 'Maswali Yanayoulizwa Mara kwa Mara',
    faq1Q: 'SoberWatch inazuiaje ajali barabarani?',
    faq1A: 'SoberWatch hupima kiwango cha pombe na kutambua mtikisiko mkubwa wa ajali kisha kupiga simu ya dharura moja kwa moja.',
    faq2Q: 'Je, nawezaje kusitisha simu ya dharura iliyotokea kwa bahati mbaya?',
    faq2A: 'Una sekunde 10 za kubonyeza "Sitisha" au kusema kwa sauti "Sitisha" / "Hagarika" kabla simu haijapigwa.',
    faq3Q: 'Je, data zangu ziko salama?',
    faq3A: 'Ndiyo, data zote zinalindwa kwa teknolojia ya kisasa ya usimbaji fiche.',
    contactSupportTitle: 'Wasiliana na Msaada',
    contactSupportDesc: 'Unahitaji usaidizi kuhusu kifaa chako cha SoberWatch?',
    sendSupportEmail: 'Tuma Barua Pepe kwa Msaada',
    troubleshootingTitle: 'Utatuzi wa Matatizo',
    troubleshooting1: 'Washa Bluetooth ili kuunganisha na kifaa cha SoberBand.',
    troubleshooting2: 'Ruhusu vibali vya kupiga simu na kutambua eneo (GPS).',
    troubleshooting3: 'Kama sauti haifanyi kazi, angalia kibali cha maikrofoni (RECORD_AUDIO).',
    appUsageTitle: 'Mwongozo wa Matumizi',
    appUsageText: 'Vaa saa ya SoberWatch mkononi mwako kwa ufuatiliaji endelevu wa afya na usalama.',

    sosButton: 'PIGA SIMU YA DHARURA (SOS)',
    sosActiveTitle: 'MFUMO WA DHARURA UMEWASHWA',
    sosCountdownText: 'Simu ya dharura itapigwa ndani ya:',
    cancelEmergency: 'SITISHA SIMU YA DHARURA',
    emergencyCallStarting: 'Kuanzisha simu...',
    emergencyCallInProgress: 'Simu ya dharura inaendelea...',
    emergencyCallSuccess: 'Simu ya dharura imepigwa kikamilifu',
    emergencyCallFailed: 'Imeshindwa kupiga simu. Angalia mtandao.',
    emergencyLocationAcquired: 'Eneo la GPS limethibitishwa.',
    emergencyLocationSearching: 'Kutafuta eneo la GPS...',
    emergencyServiceRwanda: 'Huduma ya Dharura ya Kitaifa ya Rwanda (112)',
    primaryEmergencyContact: 'Mtu wa Kwanza wa Dharura',
    secondaryEmergencyContact: 'Mtu wa Pili wa Dharura',
    emergencyServiceNumber: 'Nambari ya Dharura ya Kitaifa (112)',
    crashDetection: 'Kutambua Ajali Kali (Crash Detection)',
    crashDetectionDesc: 'Hutambua mtikisiko mkubwa wa ajali ya gari au pikipiki',
    fallDetection: 'Kutambua Kuanguka Ghafla (Fall Detection)',
    fallDetectionDesc: 'Hutambua mtu akianguka ghafla na kupoteza fahamu',
    testMode: 'Mfumo wa Majaribio (Test Mode)',
    testModeDesc: 'Jaribu mfumo wa dharura bila kupiga simu halisi kwa watoa huduma',
    testModeBadge: 'TEST MODE',
    testEmergencyTrigger: 'Jaribu Ajali (Crash Test)',
    testSosTrigger: 'Jaribu SOS ya Haraka',
    emergencyHistoryTitle: 'Historia ya Matukio ya Dharura',
    noEmergencyHistory: 'Hakuna matukio ya dharura yaliyorekodiwa',
    noEmergencyHistoryDesc: 'Kumbukumbu zote za dharura zitaonekana hapa.',
    viewOnGoogleMaps: 'Tazama Eneo Kwenye Google Maps',
    callingMode: 'Itifaki ya Kupiga Simu',
    primaryBadge: 'YA KWANZA',
    secondaryBadge: 'YA PILI',
    setPrimary: 'Weka Kuwa ya Kwanza',
    setSecondary: 'Weka Kuwa ya Pili',
    phoneValidationErr: 'Tafadhali weka nambari sahihi ya simu.',
    triggerSosPrompt: 'Je, una uhakika unataka kuwasha mfumo wa dharura wa SOS sasa hivi?',
    crashSensitivity: 'Unyeti wa Kutambua Ajali',
    lowSensitivity: 'Chini',
    medSensitivity: 'Kati',
    highSensitivity: 'Juu',

    // Voice Assistant
    voiceAssistantTitle: 'Msaidizi wa Sauti wa SoberWatch AI',
    voiceAssistantSubtitle: 'Amri za sauti za lugha nyingi na kipaumbele cha Kinyarwanda',
    voiceListening: 'Inasikiliza sauti yako...',
    voiceRecognizing: 'Inatambua sauti...',
    voiceProcessing: 'Inachakata amri...',
    voiceSpeaking: 'SoberWatch inaongea...',
    voiceTapToSpeak: 'Gusa ili kuongea',
    voiceStopListening: 'Acha Kusikiliza',
    voiceQuickPhrases: 'Amri za Sauti za Haraka',
    voiceWakeWordEnabled: 'Neno la Kuamsha ("SoberWatch")',
    voiceContinuousMode: 'Njia ya Kusikiliza Mfululizo',
    voiceMuted: 'Sauti imezimwa',
    voiceUnmuted: 'Sauti imewashwa',
    voiceTestModeTitle: 'Kipimo cha Sauti cha AI',
    voiceTestModeDesc: 'Jaribu utambuzi wa sauti na maana bila kuhitaji maikrofoni halisi',
    voiceSimulateCommand: 'Jaribu Amri ya Sauti',
    voiceIntentDetected: 'Kusudio Lililotambuliwa',
    voiceConfidence: 'Uhakika',
    voiceMicrophonePermission: 'Kibali cha Maikrofoni (RECORD_AUDIO)',
    voiceMicrophoneRequired: 'Kibali cha maikrofoni kinahitajika ili kutumia msaidizi wa sauti.',
    voiceSayCancelToStop: 'Sema "Sitisha", "Acha" au "Hagarika" ili kusitisha simu ya dharura.',
    voiceKinyarwandaPrimary: 'Imeboreshwa kwa Kinyarwanda, Kiingereza, Kifaransa, na Kiswahili.',
    voiceHelpTitle: 'Amri za Sauti za SoberWatch',
    voiceHelpBody: 'Amri unazoweza kutumia:\n• "Ndababaye, hamagara ubutabazi" (Dharura ya SOS)\n• "Piga simu ya dharura" au "Niko katika hatari"\n• "Piga simu mama" au "Piga simu meneja"\n• "Sitisha" au "Hagarika" (Kusitisha dharura)\n• "Angalia afya" au "Naweza kuendesha gari?"\n• "Kiwango cha pombe ni kiasi gani?"',

    downloadData: 'Pakua Data za Afya',
    downloadDataDesc: 'Pakua kumbukumbu ya vipimo katika mfumo wa JSON au CSV',
    exportJson: 'Pakua JSON',
    exportCsv: 'Pakua CSV',
    clearCache: 'Futa Kumbukumbu ya Kifaa',
    clearCacheDesc: 'Futa taarifa zote zilizohifadhiwa kwenye kifaa hiki',
    clearBtn: 'Futa Kumbukumbu Zote',
    clearedSuccess: 'Kumbukumbu ya kifaa imefutwa.',
    downloadSuccess: 'Data zimepakuliwa kikamilifu.',
    privacyInfoTitle: 'Ilani ya Faragha',
    privacyInfoBody: 'Taarifa zako za afya zinatunzwa kwa usiri mkubwa na kusimbwa kwa njia salama.',

    version: 'Toleo 3.2.0 (Injini ya Sauti ya Kinyarwanda & Simu za Dharura)',
    productDesc: 'SoberWatch ni mfumo wa kisasa wa kulinda usalama barabarani na kuzuia ajali za ulevi nchini Rwanda.',
    hardwareSpecsTitle: 'Maelezo ya Kifaa',
    hardwareSpecs: 'SoberBand HW: Sensor ya MQ-3, PPG ya afya ya moyo, Accelerometer ya ajali, ACTION_CALL ya Android.',
    copyrightNotice: '© 2026 SoberWatch Ltd. Haki zote zimehifadhiwa.'
  }
};
