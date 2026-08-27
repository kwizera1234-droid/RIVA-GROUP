import { Language, VoiceIntent, VoiceIntentMatch, EmergencyContact, TelemetryReading } from '../types';

/**
 * Normalizes input text for multi-lingual acoustic and dialect variances.
 */
export function normalizeVoiceText(input: string): string {
  if (!input) return '';
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'’]/g, ' ') // replace punctuation with space
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts and removes wake words ("SoberWatch", "Sober Watch", "Sobawatch").
 */
export function checkAndStripWakeWord(text: string): { hasWakeWord: boolean; cleanText: string } {
  const norm = normalizeVoiceText(text);
  const wakeWordPatterns = [
    /\bsober\s*watch\b/gi,
    /\bsoba\s*watch\b/gi,
    /\bsoberwatch\b/gi,
    /\bsoba\b/gi,
  ];

  let hasWakeWord = false;
  let clean = norm;

  for (const pat of wakeWordPatterns) {
    if (pat.test(clean)) {
      hasWakeWord = true;
      clean = clean.replace(pat, '').trim();
    }
  }

  return { hasWakeWord, cleanText: clean || norm };
}

/**
 * Primary multi-lingual Voice Intent Classifier with Kinyarwanda primacy.
 */
export function classifyVoiceIntent(
  rawTranscript: string,
  currentLanguage: Language = 'rw',
  options?: {
    primaryContact?: EmergencyContact | null;
    secondaryContact?: EmergencyContact | null;
    currentReading?: TelemetryReading | null;
  }
): VoiceIntentMatch {
  const { cleanText } = checkAndStripWakeWord(rawTranscript);
  const norm = cleanText;

  // 1. CANCEL_EMERGENCY (Highest priority when in emergency countdown/alert state)
  const cancelKinyarwanda = [
    'hagarika', 'hagarara', 'reka', 'bireke', 'oya', 'hagarika emergency',
    'ntubihamagare', 'ndameze neza', 'sinkeneye ubufasha', 'hagarika guhamagara',
    'nta kibazo', 'ndi muzima'
  ];
  const cancelEnglish = [
    'cancel', 'stop', 'abort', 'halt', 'cancel emergency', 'dont call',
    'do not call', 'i am okay', 'im fine', 'no emergency', 'false alarm',
    'stop calling', 'never mind', 'dismiss'
  ];
  const cancelFrench = [
    'annuler', 'arreter', 'stop', 'annule', 'ne pas appeler', 'je vais bien',
    'fausse alerte', 'arrete', 'non'
  ];
  const cancelSwahili = [
    'sitisha', 'acha', 'simamisha', 'ghairi', 'hapana', 'niko salama',
    'usiite', 'acha kupiga', 'sihitaji msaada'
  ];

  if (matchesAny(norm, [...cancelKinyarwanda, ...cancelEnglish, ...cancelFrench, ...cancelSwahili])) {
    return {
      intent: 'CANCEL_EMERGENCY',
      confidence: 0.98,
      rawText: rawTranscript,
      normalizedText: norm,
      detectedLanguage: detectLanguage(norm, currentLanguage),
      speechResponse: getCancelSpeechResponse(currentLanguage),
    };
  }

  // 2. SPECIFIC CONTACT CALLING (e.g. "Hamagara Mama", "Hamagara Manager", "Call Mom")
  const contactCallKinyarwanda = [
    'hamagara mama', 'mpamagarira mama', 'hamagara papa', 'mpamagarira papa',
    'hamagara umuntu wanjye', 'mpamagarira umuntu wanjye', 'hamagara umuyobozi',
    'hamagara manager', 'hamagara boss', 'hamagara umugore wanjye', 'hamagara umugabo wanjye',
    'hamagara primary contact', 'hamagara nimero ya mbere', 'hamagara contact ya mbere'
  ];
  const contactCallEnglish = [
    'call mom', 'call mama', 'call dad', 'call papa', 'call my contact',
    'call primary contact', 'call manager', 'call my boss', 'call my wife',
    'call my husband', 'call first contact', 'call emergency contact'
  ];
  const contactCallFrench = [
    'appeler maman', 'appeler papa', 'appeler mon contact', 'appeler responsable',
    'appeler le manager', 'appeler premier contact'
  ];
  const contactCallSwahili = [
    'piga simu mama', 'piga simu baba', 'piga simu mtu wangu', 'piga simu meneja',
    'piga simu nambari ya kwanza'
  ];

  if (matchesAny(norm, [...contactCallKinyarwanda, ...contactCallEnglish, ...contactCallFrench, ...contactCallSwahili])) {
    const contactName = extractTargetContactName(norm, options?.primaryContact);
    const contactPhone = options?.primaryContact?.phone || '112';

    return {
      intent: 'CALL_PRIMARY_CONTACT',
      confidence: 0.95,
      rawText: rawTranscript,
      normalizedText: norm,
      detectedLanguage: detectLanguage(norm, currentLanguage),
      extractedEntity: {
        contactTarget: 'primary',
        contactName: contactName || options?.primaryContact?.name || 'Primary Contact',
        contactPhone,
      },
      speechResponse: getCallContactSpeechResponse(
        contactName || options?.primaryContact?.name || 'Primary Contact',
        contactPhone,
        currentLanguage
      ),
    };
  }

  // Secondary contact calling
  const secondaryKinyarwanda = ['hamagara secondary contact', 'hamagara nimero ya kabiri', 'hamagara umuntu wa kabiri', 'hamagara contact ya kabiri'];
  const secondaryEnglish = ['call secondary contact', 'call second contact', 'call backup contact'];
  const secondaryFrench = ['appeler contact secondaire', 'appeler deuxieme contact'];
  const secondarySwahili = ['piga simu nambari ya pili', 'piga simu msaidizi wa pili'];

  if (matchesAny(norm, [...secondaryKinyarwanda, ...secondaryEnglish, ...secondaryFrench, ...secondarySwahili])) {
    const contactPhone = options?.secondaryContact?.phone || options?.primaryContact?.phone || '112';
    const contactName = options?.secondaryContact?.name || 'Secondary Contact';

    return {
      intent: 'CALL_SECONDARY_CONTACT',
      confidence: 0.94,
      rawText: rawTranscript,
      normalizedText: norm,
      detectedLanguage: detectLanguage(norm, currentLanguage),
      extractedEntity: {
        contactTarget: 'secondary',
        contactName,
        contactPhone,
      },
      speechResponse: getCallContactSpeechResponse(contactName, contactPhone, currentLanguage),
    };
  }

  // 3. EMERGENCY_REQUEST (Core safety trigger)
  const emergencyKinyarwanda = [
    'ndababaye', 'ndababaye cyane', 'nkeneye ubufasha', 'ndakeneye ubufasha',
    'hamagara ubutabazi', 'mbwira ubutabazi', 'fasha', 'mfasha', 'ndafite ikibazo',
    'nagize impanuka', 'nakoze impanuka', 'nagize accident', 'nakoze accident',
    'koresha emergency', 'tanga emergency', 'emergency', 'hamagara emergency',
    'ndashaka ko umpamagirira', 'ndashaka ubutabazi', 'impanuka yabaye',
    'ndarembye', 'ndarembye cyane', 'ndakomeretse', 'fasha ndababaye',
    'hamagara ubutabazi nonaha', 'fasha ubutabazi', 'nyamuneka mfasha'
  ];
  const emergencyEnglish = [
    'emergency', 'help', 'help me', 'call emergency', 'call 112', 'call 911',
    'call 999', 'i need help', 'i need assistance', 'i am in danger', 'im in danger',
    'i had an accident', 'i have an accident', 'car crash', 'severe crash',
    'i fell down', 'call ambulance', 'call police', 'call rescue', 'im hurting',
    'in trouble', 'danger alert', 'trigger sos'
  ];
  const emergencyFrench = [
    'urgence', 'aidez-moi', 'au secours', 'appelez les secours', 'appeler secours',
    'je suis en danger', 'j ai eu un accident', 'jai eu un accident', 'accident',
    'appelez l ambulance', 'besoin d aide', 'sos'
  ];
  const emergencySwahili = [
    'dharura', 'msaada', 'nisaidie', 'piga simu ya dharura', 'niko hatarini',
    'nimepata ajali', 'piga simu 112', 'ninahitaji msaada', 'nahitaji msaada',
    'msaada wa haraka'
  ];

  if (matchesAny(norm, [...emergencyKinyarwanda, ...emergencyEnglish, ...emergencyFrench, ...emergencySwahili])) {
    return {
      intent: 'EMERGENCY_REQUEST',
      confidence: 0.97,
      rawText: rawTranscript,
      normalizedText: norm,
      detectedLanguage: detectLanguage(norm, currentLanguage),
      speechResponse: getEmergencyDetectedSpeechResponse(currentLanguage),
    };
  }

  // 4. CHECK_HEALTH
  const healthKinyarwanda = [
    'reba ubuzima', 'ubuzima bwanjye', 'umutima utera', 'heart rate', 'spo2',
    'reba ibipimo', 'ubuzima bumeze gute', 'ibipimo byanjye', 'ubuzima'
  ];
  const healthEnglish = [
    'check health', 'check my vitals', 'how is my heart rate', 'check heart rate',
    'vitals status', 'how am i doing', 'my health', 'health report', 'biometrics'
  ];
  const healthFrench = ['verifier ma sante', 'etat de sante', 'frequence cardiaque', 'mes constantes', 'ma sante'];
  const healthSwahili = ['angalia afya', 'hali ya afya', 'mapigo ya moyo', 'afya yangu'];

  if (matchesAny(norm, [...healthKinyarwanda, ...healthEnglish, ...healthFrench, ...healthSwahili])) {
    const reading = options?.currentReading;
    const hr = reading?.heartRateBpm ?? 72;
    const bac = (reading?.alcoholBac ?? 0).toFixed(2);
    const status = reading?.status ?? 'SAFE';

    return {
      intent: 'CHECK_HEALTH',
      confidence: 0.92,
      rawText: rawTranscript,
      normalizedText: norm,
      detectedLanguage: detectLanguage(norm, currentLanguage),
      speechResponse: getHealthSpeechResponse(bac, hr, status, currentLanguage),
    };
  }

  // 5. CHECK_DRIVING_READINESS
  const drivingKinyarwanda = [
    'nshobora gutwara', 'reba gutwara', 'gutwara imodoka', 'ubushobozi bwo gutwara',
    'gutwara bimeze bite', 'ndatwara', 'gutwara'
  ];
  const drivingEnglish = [
    'can i drive', 'am i fit to drive', 'check driving readiness', 'driving status',
    'is it safe to drive', 'can i drive now', 'safe to drive'
  ];
  const drivingFrench = ['puis je conduire', 'puis-je conduire', 'etat pour conduire', 'aptitude a la conduite'];
  const drivingSwahili = ['naweza kuendesha', 'hali ya kuendesha gari', 'salama kuendesha'];

  if (matchesAny(norm, [...drivingKinyarwanda, ...drivingEnglish, ...drivingFrench, ...drivingSwahili])) {
    const bac = options?.currentReading?.alcoholBac ?? 0;
    const isSafe = bac < 0.02;
    return {
      intent: 'CHECK_DRIVING_READINESS',
      confidence: 0.93,
      rawText: rawTranscript,
      normalizedText: norm,
      detectedLanguage: detectLanguage(norm, currentLanguage),
      speechResponse: getDrivingReadinessSpeechResponse(isSafe, bac, currentLanguage),
    };
  }

  // 6. CHECK_ALCOHOL_STATUS
  const alcoholKinyarwanda = ['reba inzoga', 'igipimo cy inzoga', 'bac yanjye', 'level y inzoga', 'inzoga'];
  const alcoholEnglish = ['check bac', 'alcohol level', 'check alcohol', 'what is my bac', 'alcohol status'];
  const alcoholFrench = ['taux d alcoolemie', 'verifier l alcool', 'mon niveau d alcool'];
  const alcoholSwahili = ['kiwango cha pombe', 'angalia ulevi', 'hali ya pombe'];

  if (matchesAny(norm, [...alcoholKinyarwanda, ...alcoholEnglish, ...alcoholFrench, ...alcoholSwahili])) {
    const bac = (options?.currentReading?.alcoholBac ?? 0).toFixed(2);
    return {
      intent: 'CHECK_ALCOHOL_STATUS',
      confidence: 0.94,
      rawText: rawTranscript,
      normalizedText: norm,
      detectedLanguage: detectLanguage(norm, currentLanguage),
      speechResponse: getAlcoholSpeechResponse(bac, currentLanguage),
    };
  }

  // 7. CHECK_LOCATION
  const locationKinyarwanda = ['aho ndi', 'ndihe', 'reba aho ndi', 'location yanjye', 'umwanya wanjye'];
  const locationEnglish = ['where am i', 'check location', 'my location', 'what is my location', 'current coordinates'];
  const locationFrench = ['ou suis je', 'ma localisation', 'mes coordonnees', 'ou je suis'];
  const locationSwahili = ['niko wapi', 'mahali nilipo', 'angalia eneo langu'];

  if (matchesAny(norm, [...locationKinyarwanda, ...locationEnglish, ...locationFrench, ...locationSwahili])) {
    return {
      intent: 'CHECK_LOCATION',
      confidence: 0.91,
      rawText: rawTranscript,
      normalizedText: norm,
      detectedLanguage: detectLanguage(norm, currentLanguage),
      speechResponse: getLocationSpeechResponse(currentLanguage),
    };
  }

  // 8. HELP
  const helpKinyarwanda = ['ubufasha', 'amabwiriza', 'wampa ubufasha', 'ushobora gukora iki', 'mfasha kubyumva'];
  const helpEnglish = ['help', 'what can you do', 'commands', 'how does this work', 'assistant help', 'instructions'];
  const helpFrench = ['aide', 'que pouvez vous faire', 'instructions', 'aidez moi'];
  const helpSwahili = ['msaada', 'unaweza kufanya nini', 'maagizo ya sauti'];

  if (matchesAny(norm, [...helpKinyarwanda, ...helpEnglish, ...helpFrench, ...helpSwahili])) {
    return {
      intent: 'HELP',
      confidence: 0.95,
      rawText: rawTranscript,
      normalizedText: norm,
      detectedLanguage: detectLanguage(norm, currentLanguage),
      speechResponse: getHelpSpeechResponse(currentLanguage),
    };
  }

  // 9. NORMAL CONVERSATION (greetings / affirmative / casual)
  const conversationWords = [
    'hello', 'hi', 'muraho', 'mwaramutse', 'mwiriwe', 'bite', 'jambo', 'bonjour', 'salut',
    'yego', 'yes', 'oui', 'ndakomeje', 'sawa', 'urakoze', 'merci', 'asante', 'thank you'
  ];
  if (matchesAny(norm, conversationWords)) {
    return {
      intent: 'NORMAL_CONVERSATION',
      confidence: 0.85,
      rawText: rawTranscript,
      normalizedText: norm,
      detectedLanguage: detectLanguage(norm, currentLanguage),
      speechResponse: getConversationSpeechResponse(norm, currentLanguage),
    };
  }

  // 10. UNKNOWN_COMMAND fallback
  return {
    intent: 'UNKNOWN_COMMAND',
    confidence: 0.4,
    rawText: rawTranscript,
    normalizedText: norm,
    detectedLanguage: detectLanguage(norm, currentLanguage),
    speechResponse: getUnknownSpeechResponse(currentLanguage),
  };
}

/**
 * Checks whether text contains any of the target phrases.
 */
function matchesAny(text: string, phrases: string[]): boolean {
  for (const phrase of phrases) {
    const normalizedPhrase = normalizeVoiceText(phrase);
    if (text.includes(normalizedPhrase)) {
      return true;
    }
  }
  return false;
}

/**
 * Language detector heuristic.
 */
function detectLanguage(text: string, defaultLang: Language): Language {
  const kinyarwandaMarkers = ['ndababaye', 'ubutabazi', 'impanuka', 'hamagara', 'ubufasha', 'hagarika', 'muraho', 'cyane', 'koresha', 'reka'];
  const frenchMarkers = ['urgence', 'secours', 'appelez', 'annuler', 'bonjour', 'aidez', 'conduire'];
  const swahiliMarkers = ['dharura', 'msaada', 'piga', 'simu', 'sitisha', 'habari', 'salama', 'ajali'];
  const englishMarkers = ['emergency', 'help', 'call', 'cancel', 'stop', 'accident', 'health', 'drive'];

  for (const m of kinyarwandaMarkers) if (text.includes(m)) return 'rw';
  for (const m of frenchMarkers) if (text.includes(m)) return 'fr';
  for (const m of swahiliMarkers) if (text.includes(m)) return 'sw';
  for (const m of englishMarkers) if (text.includes(m)) return 'en';

  return defaultLang;
}

function extractTargetContactName(text: string, primaryContact?: EmergencyContact | null): string {
  if (text.includes('mama') || text.includes('mom')) return 'Mama';
  if (text.includes('papa') || text.includes('dad')) return 'Papa';
  if (text.includes('manager') || text.includes('umuyobozi') || text.includes('boss')) return 'Manager';
  if (text.includes('umugore') || text.includes('wife')) return 'Umufasha';
  if (text.includes('umugabo') || text.includes('husband')) return 'Umugabo';
  return primaryContact?.name || 'Primary Contact';
}

// ----------------------------------------------------
// Natural Spoken Responses in All Supported Languages
// ----------------------------------------------------

export function getEmergencyDetectedSpeechResponse(lang: Language): string {
  switch (lang) {
    case 'rw':
      return "Nabyumvise. Ufite emergency. Ndimo gutegura guhamagara ubutabazi. Vuga 'Hagarika' niba atari emergency.";
    case 'fr':
      return "J'ai compris. Vous êtes en situation d'urgence. Je prépare l'appel de secours. Dites 'Annuler' si ce n'est pas une urgence.";
    case 'sw':
      return "Nimekuelewa. Una dharura. Ninatayarisha kupiga simu ya dharura. Sema 'Sitisha' kama sio dharura.";
    case 'en':
    default:
      return "Emergency request detected. Preparing to place emergency call. Say 'Cancel' or 'Stop' to cancel.";
  }
}

export function getCancelSpeechResponse(lang: Language): string {
  switch (lang) {
    case 'rw':
      return "Emergency yahagaritswe. Umeze neza.";
    case 'fr':
      return "L'urgence a été annulée avec succès.";
    case 'sw':
      return "Dharura imesitishwa. Uko salama.";
    case 'en':
    default:
      return "Emergency process has been successfully cancelled.";
  }
}

export function getCallContactSpeechResponse(contactName: string, phone: string, lang: Language): string {
  switch (lang) {
    case 'rw':
      return `Ndahamagara ${contactName} kuri ${phone}. Vuga 'Hagarika' mu masegonda 5 niba utabishaka.`;
    case 'fr':
      return `J'appelle ${contactName} au ${phone}. Dites 'Annuler' dans les 5 secondes pour annuler.`;
    case 'sw':
      return `Ninapiga simu kwa ${contactName} kwa nambari ${phone}. Sema 'Sitisha' ndani ya sekunde tano ikiwa hutaki.`;
    case 'en':
    default:
      return `Calling ${contactName} at ${phone}. Say 'Cancel' within 5 seconds to stop.`;
  }
}

export function getHealthSpeechResponse(bac: string, hr: number, status: string, lang: Language): string {
  switch (lang) {
    case 'rw':
      return `Amakuru y'ubuzima: BAC ni ${bac} g/L. Umutima utera inshuro ${hr} ku munota. Imiterere yawe ni ${status}.`;
    case 'fr':
      return `Bilan de santé: Alcoolémie à ${bac} g/L. Pouls cardiaque de ${hr} battements par minute. Statut: ${status}.`;
    case 'sw':
      return `Taarifa ya afya: Kiwango cha pombe ni ${bac} g/L. Mapigo ya moyo ni ${hr} kwa dakika. Hali ni ${status}.`;
    case 'en':
    default:
      return `Health telemetry report: BAC is ${bac} g/L. Heart rate is ${hr} beats per minute. Status is ${status}.`;
  }
}

export function getDrivingReadinessSpeechResponse(isSafe: boolean, bac: number, lang: Language): string {
  switch (lang) {
    case 'rw':
      return isSafe 
        ? `Ubushobozi bwo gutwara: Nta kigero cy'inzoga cyabonetse. Umeze neza gutwara.` 
        : `Ubushobozi bwo gutwara: Ntibyemewe gutwara. BAC yawe ni ${bac.toFixed(2)} g/L. Witware imodoka!`;
    case 'fr':
      return isSafe
        ? `Aptitude à la conduite: Taux d'alcool normal. Vous pouvez conduire en sécurité.`
        : `Aptitude à la conduite: Danger. Alcoolémie élevée à ${bac.toFixed(2)} g/L. Ne conduisez pas.`;
    case 'sw':
      return isSafe
        ? `Hali ya kuendesha: Kiwango cha pombe kiko salama. Unaweza kuendesha gari.`
        : `Hali ya kuendesha: Hatari. Kiwango cha pombe ni ${bac.toFixed(2)} g/L. Usiendeshe gari.`;
    case 'en':
    default:
      return isSafe
        ? `Driving readiness: BAC is within safe limits. You are safe to drive.`
        : `Driving readiness: Unsafe to drive. Alcohol level is ${bac.toFixed(2)} g/L. Please do not drive.`;
  }
}

export function getAlcoholSpeechResponse(bac: string, lang: Language): string {
  switch (lang) {
    case 'rw':
      return `Igipimo cy'inzoga muri uyu mwanya ni ${bac} g/L.`;
    case 'fr':
      return `Votre taux d'alcoolémie actuel est de ${bac} g/L.`;
    case 'sw':
      return `Kiwango cha pombe kwa sasa ni ${bac} g/L.`;
    case 'en':
    default:
      return `Your current blood alcohol concentration is ${bac} g/L.`;
  }
}

export function getLocationSpeechResponse(lang: Language): string {
  switch (lang) {
    case 'rw':
      return "Ndimo gufata umwanya wawe kuri GPS. Uherereye mu mujyi wa Kigali, u Rwanda.";
    case 'fr':
      return "Localisation GPS active. Coordonnées enregistrées avec succès.";
    case 'sw':
      return "Eneo lako la GPS linapatikana kwa ufuatiliaji wa usalama.";
    case 'en':
    default:
      return "Your GPS location is being actively acquired for emergency telemetry.";
  }
}

export function getHelpSpeechResponse(lang: Language): string {
  switch (lang) {
    case 'rw':
      return "Ndi SoberWatch AI Voice Assistant. Ushobora kuvuga: 'Hamagara ubutabazi', 'Ndababaye', 'Reba ubuzima bwanjye', 'Hamagara mama', cyangwa 'Hagarika'.";
    case 'fr':
      return "Je suis l'assistant vocal SoberWatch. Vous pouvez dire: 'Appelez les secours', 'Je suis en danger', 'Vérifier ma santé', ou 'Appeler maman'.";
    case 'sw':
      return "Mimi ni SoberWatch Voice Assistant. Unaweza kusema: 'Piga simu ya dharura', 'Niko katika hatari', 'Angalia afya', au 'Piga simu mama'.";
    case 'en':
    default:
      return "I am the SoberWatch Voice Assistant. You can speak commands like: 'Call emergency', 'I need help', 'Check my health', 'Call my contact', or 'Cancel'.";
  }
}

export function getConversationSpeechResponse(normText: string, lang: Language): string {
  switch (lang) {
    case 'rw':
      return "Muraho! Ndi SoberWatch Voice Assistant. Niteguye kugufasha no kurinda umutekano wawe.";
    case 'fr':
      return "Bonjour! Je suis l'assistant vocal SoberWatch. Je suis prêt à vous assister et veiller sur votre sécurité.";
    case 'sw':
      return "Jambo! Mimi ni SoberWatch Voice Assistant. Niko tayari kukusaidia na kulinda usalama wako.";
    case 'en':
    default:
      return "Hello! I am your SoberWatch AI Assistant. Ready to assist you and protect your safety.";
  }
}

export function getUnknownSpeechResponse(lang: Language): string {
  switch (lang) {
    case 'rw':
      return "Sinabyumvise neza. Vuga 'Hamagara ubutabazi' niba ukeneye ubufasha, cyangwa 'Ubufasha' kumva amabwiriza.";
    case 'fr':
      return "Commande non reconnue. Dites 'Appelez les secours' pour une urgence ou 'Aide' pour la liste des commandes.";
    case 'sw':
      return "Sikuelewa vizuri. Sema 'Piga simu ya dharura' kama unahitaji msaada, au 'Msaada' kusikia maagizo.";
    case 'en':
    default:
      return "Command not recognized. Say 'Call emergency' if you need help, or 'Help' to hear available commands.";
  }
}
