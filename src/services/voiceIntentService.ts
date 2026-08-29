import { Language, VoiceIntent, VoiceIntentMatch, EmergencyContact, TelemetryReading, VoiceErrorCode } from '../types';

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

export function detectLanguage(text: string, fallback: Language = 'rw'): Language {
  const norm = normalizeVoiceText(text);
  if (!norm) return fallback;

  const rwKeywords = [
    'hamagara', 'mpamagarira', 'ubutabazi', 'hagarika', 'reba', 'mbwira', 'uko', 'meze',
    'ubuzima', 'umutima', 'inzoga', 'gutwara', 'imodoka', 'aho', 'ndi', 'komeza', 'muraho',
    'bite', 'urakoze', 'ndababaye', 'fata', 'location', 'igipimo', 'ndameze', 'yanjye', 'bwanjye'
  ];
  const frKeywords = [
    'bonjour', 'appeler', 'urgence', 'arreter', 'annuler', 'secours', 'alcool', 'sante',
    'pouls', 'position', 'rapport', 'aide', 'merci'
  ];
  const swKeywords = [
    'jambo', 'habari', 'piga', 'simu', 'dharura', 'sitisha', 'pombe', 'afya', 'mapigo',
    'eneo', 'ripoti', 'msaada', 'asante'
  ];

  let rwScore = 0;
  let frScore = 0;
  let swScore = 0;
  let enScore = 0;

  const words = norm.split(' ');
  for (const w of words) {
    if (rwKeywords.some((k) => w.includes(k) || k.includes(w))) rwScore += 2;
    if (frKeywords.some((k) => w.includes(k) || k.includes(w))) frScore += 2;
    if (swKeywords.some((k) => w.includes(k) || k.includes(w))) swScore += 2;
  }

  if (rwScore >= 2 && rwScore >= frScore && rwScore >= swScore) return 'rw';
  if (frScore >= 2 && frScore > rwScore && frScore >= swScore) return 'fr';
  if (swScore >= 2 && swScore > rwScore && swScore >= frScore) return 'sw';

  return fallback;
}

/**
 * Fuzzy check if input matches any target phrase or regex stem
 */
export function matchesAny(text: string, phrases: (string | RegExp)[]): boolean {
  const norm = normalizeVoiceText(text);
  if (!norm) return false;

  return phrases.some((p) => {
    if (typeof p === 'string') {
      const pNorm = normalizeVoiceText(p);
      return norm.includes(pNorm) || pNorm.includes(norm);
    }
    return p.test(norm);
  });
}

/**
 * Extracts target contact name from voice transcript (e.g., "Hamagara John", "Call Dr. Jean Paul", "Ndashaka kuvugana na Alice")
 */
export function extractTargetContactName(
  text: string, 
  contacts: EmergencyContact[] = []
): { contactName?: string; contactPhone?: string; matchedContact?: EmergencyContact } {
  const norm = normalizeVoiceText(text);

  // 1. Direct matching against configured contact names
  for (const c of contacts) {
    const cNorm = normalizeVoiceText(c.name);
    const firstName = cNorm.split(' ')[0];
    if (cNorm && norm.includes(cNorm)) {
      return { contactName: c.name, contactPhone: c.phone, matchedContact: c };
    }
    if (firstName && firstName.length > 2 && norm.includes(firstName)) {
      return { contactName: c.name, contactPhone: c.phone, matchedContact: c };
    }
  }

  // 2. Regex extraction for patterns like "hamagara [NAME]", "call [NAME]", "appeler [NAME]"
  const callRegex = /(?:hamagara|mpamagarira|call|appeler|piga\s+simu\s+(?:kwa)?|kuvugana\s+na)\s+([a-zA-Z\s]+)/i;
  const match = norm.match(callRegex);
  if (match && match[1]) {
    const extracted = match[1]
      .replace(/\b(?:emergency|contact|nimero|ubutabazi|please|nyamuneka)\b/gi, '')
      .trim();
    if (extracted.length > 1) {
      // Re-check extracted name against contacts
      const matched = contacts.find(
        (c) => normalizeVoiceText(c.name).includes(extracted) || extracted.includes(normalizeVoiceText(c.name).split(' ')[0])
      );
      return {
        contactName: matched ? matched.name : extracted,
        contactPhone: matched ? matched.phone : undefined,
        matchedContact: matched,
      };
    }
  }

  return {};
}

/**
 * Server-side Semantic Intent Classification using Gemini 3.7 Flash
 */
export async function classifyVoiceIntentSemantic(
  rawTranscript: string,
  currentLanguage: Language = 'rw',
  options?: {
    contacts?: EmergencyContact[];
    currentReading?: TelemetryReading | null;
  }
): Promise<VoiceIntentMatch> {
  const cleanTranscript = rawTranscript.trim();
  if (!cleanTranscript) {
    return classifyVoiceIntentLocal('', currentLanguage, options);
  }

  try {
    const response = await fetch('/api/voice/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: cleanTranscript,
        language: currentLanguage,
        contacts: options?.contacts || [],
        currentReading: options?.currentReading || null,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return {
        intent: data.intent as VoiceIntent,
        confidence: data.confidence ?? 0.95,
        rawText: cleanTranscript,
        normalizedText: normalizeVoiceText(cleanTranscript),
        detectedLanguage: (data.detectedLanguage as Language) || currentLanguage,
        extractedEntity: data.extractedEntity,
        speechResponse: data.speechResponse,
      };
    }
  } catch (err) {
    console.warn('[VOICE INTENT] Server classification fallback to local engine:', err);
  }

  // Fallback to comprehensive local rule engine if offline or server error
  return classifyVoiceIntentLocal(cleanTranscript, currentLanguage, options);
}

/**
 * Comprehensive Local / Offline Voice Intent Classifier with robust semantic matching
 */
export function classifyVoiceIntentLocal(
  rawTranscript: string,
  currentLanguage: Language = 'rw',
  options?: {
    contacts?: EmergencyContact[];
    primaryContact?: EmergencyContact | null;
    secondaryContact?: EmergencyContact | null;
    currentReading?: TelemetryReading | null;
  }
): VoiceIntentMatch {
  const { cleanText } = checkAndStripWakeWord(rawTranscript);
  const norm = cleanText;

  const contactsList = options?.contacts || [];
  const primaryContact = options?.primaryContact || contactsList.find((c) => c.isPrimary) || contactsList[0] || null;
  const secondaryContact = options?.secondaryContact || contactsList.find((c) => c.isSecondary) || (contactsList.length > 1 ? contactsList[1] : null);
  const reading = options?.currentReading || null;
  const lang = detectLanguage(norm, currentLanguage);

  if (!norm) {
    return {
      intent: 'UNKNOWN_COMMAND',
      confidence: 0,
      rawText: rawTranscript,
      normalizedText: '',
      detectedLanguage: lang,
      speechResponse: getVoiceErrorMessage('EMPTY_TRANSCRIPT', lang),
    };
  }

  // 1. CANCEL_EMERGENCY
  const cancelPhrases = [
    'hagarika', 'hagarara', 'reka', 'bireke', 'oya', 'hagarika emergency',
    'ntubihamagare', 'ndameze neza', 'sinkeneye ubufasha', 'hagarika guhamagara',
    'nta kibazo', 'ndi muzima', 'cancel', 'stop', 'abort', 'halt', 'cancel emergency',
    'dont call', 'do not call', 'i am okay', 'im fine', 'no emergency', 'false alarm',
    'stop calling', 'never mind', 'dismiss', 'annuler', 'arreter', 'sitisha', 'acha'
  ];
  if (matchesAny(norm, cancelPhrases)) {
    return {
      intent: 'CANCEL_EMERGENCY',
      confidence: 0.98,
      rawText: rawTranscript,
      normalizedText: norm,
      detectedLanguage: lang,
      speechResponse: getCancelSpeechResponse(lang),
    };
  }

  // 2. SPECIFIC CONTACT CALL (e.g. "Hamagara John", "Call Mom", "Ndashaka kuvugana na Dr. Jean")
  const extracted = extractTargetContactName(norm, contactsList);
  if (extracted.contactName || matchesAny(norm, ['hamagara', 'call', 'mpamagarira', 'appeler', 'piga simu', 'kuvugana na'])) {
    // Check if user specifically requested primary or secondary
    const isPrimaryTarget = matchesAny(norm, ['primary', 'nimero ya mbere', 'contact ya mbere', 'first contact', 'premier contact']);
    const isSecondaryTarget = matchesAny(norm, ['secondary', 'nimero ya kabiri', 'contact ya kabiri', 'second contact', 'deuxieme contact', 'backup']);

    const targetContact = extracted.matchedContact || 
      (isSecondaryTarget ? (secondaryContact || primaryContact) : (isPrimaryTarget ? primaryContact : (primaryContact || secondaryContact)));
    
    const targetName = extracted.contactName || targetContact?.name || (isSecondaryTarget ? 'Secondary Contact' : 'Primary Contact');
    const targetPhone = targetContact?.phone || (primaryContact?.phone || '112');

    return {
      intent: isSecondaryTarget ? 'CALL_SECONDARY_CONTACT' : (isPrimaryTarget ? 'CALL_PRIMARY_CONTACT' : 'CALL_CONTACT'),
      confidence: 0.95,
      rawText: rawTranscript,
      normalizedText: norm,
      detectedLanguage: lang,
      extractedEntity: {
        contactTarget: isSecondaryTarget ? 'secondary' : 'primary',
        contactName: targetName,
        contactPhone: targetPhone,
      },
      speechResponse: getCallContactSpeechResponse(targetName, lang),
    };
  }

  // 3. EMERGENCY REQUEST (Accident, severe distress, help)
  const emergencyPhrases = [
    'ubutabazi', 'ntabara', 'ndarembye', 'mfasha', 'mumbare', 'impanuka', 'nabonye impanuka',
    'ndababaye cyane', 'ndababaye', 'nkeneye ubutabazi', 'nkeneye ubufasha bw ubutabazi',
    'hamagara 112', 'hamagara ambulance', 'hamagara polisi', 'emergency', 'help me', 'sos',
    'call 911', 'call 112', 'accident', 'i crashed', 'car crash', 'severe pain', 'i am dying',
    'au secours', 'urgence', 'accident de voiture', 'msaada wa haraka', 'ajali', 'dharura'
  ];
  if (matchesAny(norm, emergencyPhrases)) {
    return {
      intent: 'EMERGENCY_REQUEST',
      confidence: 0.97,
      rawText: rawTranscript,
      normalizedText: norm,
      detectedLanguage: lang,
      speechResponse: getEmergencySpeechResponse(lang),
    };
  }

  // 4. CHECK_HEALTH / VITALS / HEART RATE
  const healthPhrases = [
    'reba uko meze', 'mbwira uko meze', 'mbwira uko meze uyu munsi', 'heartbeat', 'umutima',
    'uko meze', 'ubuzima', 'reba ubuzima', 'reba umutima', 'heartbeat yanjye', 'heart rate',
    'vitals', 'check my health', 'how is my health', 'how am i doing', 'pulse', 'spo2',
    'etat de sante', 'pouls', 'frequence cardiaque', 'mapigo ya moyo', 'afya yangu'
  ];
  if (matchesAny(norm, healthPhrases)) {
    return {
      intent: 'CHECK_HEALTH',
      confidence: 0.94,
      rawText: rawTranscript,
      normalizedText: norm,
      detectedLanguage: lang,
      speechResponse: getHealthSpeechResponse(reading, lang),
    };
  }

  // 5. CHECK_ALCOHOL_STATUS / BAC
  const bacPhrases = [
    'bac', 'reba bac', 'reba bac yanjye', 'mbwira bac', 'igipimo cy inzoga', 'inzoga',
    'alcohol', 'alcohol level', 'check bac', 'what is my bac', 'my alcohol level',
    'taux d alcool', 'alcolisme', 'kiwango cha pombe'
  ];
  if (matchesAny(norm, bacPhrases)) {
    return {
      intent: 'CHECK_ALCOHOL_STATUS',
      confidence: 0.96,
      rawText: rawTranscript,
      normalizedText: norm,
      detectedLanguage: lang,
      speechResponse: getAlcoholSpeechResponse(reading, lang),
    };
  }

  // 6. CHECK_DRIVING_READINESS
  const drivingPhrases = [
    'gutwara', 'gutwara imodoka', 'nshobora gutwara', 'nshobora gutwara imodoka', 'ntware',
    'can i drive', 'am i safe to drive', 'safe to drive', 'ready to drive', 'conduire',
    'est ce que je peux conduire', 'naweza kuendesha gari'
  ];
  if (matchesAny(norm, drivingPhrases)) {
    return {
      intent: 'CHECK_DRIVING_READINESS',
      confidence: 0.95,
      rawText: rawTranscript,
      normalizedText: norm,
      detectedLanguage: lang,
      speechResponse: getDrivingSpeechResponse(reading, lang),
    };
  }

  // 7. CHECK_LOCATION / GPS
  const locationPhrases = [
    'fata location', 'fata location yanjye', 'aho ndi', 'location', 'aho ndi ni he',
    'where am i', 'my location', 'get my location', 'gps', 'position', 'ou suis je',
    'wapi nipo', 'mahali nilipo'
  ];
  if (matchesAny(norm, locationPhrases)) {
    return {
      intent: 'CHECK_LOCATION',
      confidence: 0.94,
      rawText: rawTranscript,
      normalizedText: norm,
      detectedLanguage: lang,
      speechResponse: getLocationSpeechResponse(lang),
    };
  }

  // 8. GET_DAILY_REPORT
  const reportPhrases = [
    'daily report', 'show my daily report', 'raporo', 'raporo yuyu munsi', 'raporo yange',
    'raport', 'summary', 'report', 'rapport du jour', 'ripoti ya siku'
  ];
  if (matchesAny(norm, reportPhrases)) {
    return {
      intent: 'GET_DAILY_REPORT',
      confidence: 0.93,
      rawText: rawTranscript,
      normalizedText: norm,
      detectedLanguage: lang,
      speechResponse: getDailyReportSpeechResponse(reading, lang),
    };
  }

  // 9. HELP / COMMANDS
  const helpPhrases = [
    'ubufasha', 'amabwiriza', 'wamfasha iki', 'ushobora gukora iki', 'help', 'commands',
    'what can you do', 'aide', 'comment ca marche', 'msaada', 'maagizo'
  ];
  if (matchesAny(norm, helpPhrases)) {
    return {
      intent: 'HELP',
      confidence: 0.95,
      rawText: rawTranscript,
      normalizedText: norm,
      detectedLanguage: lang,
      speechResponse: getHelpSpeechResponse(lang),
    };
  }

  // 10. CONVERSATIONAL / GREETINGS
  const convoPhrases = [
    'muraho', 'bite', 'amakuru', 'mwiriwe', 'mwaramutse', 'uraho', 'hello', 'hi',
    'good morning', 'good evening', 'bonjour', 'bonsoir', 'salut', 'jambo', 'habari'
  ];
  if (matchesAny(norm, convoPhrases)) {
    return {
      intent: 'NORMAL_CONVERSATION',
      confidence: 0.90,
      rawText: rawTranscript,
      normalizedText: norm,
      detectedLanguage: lang,
      speechResponse: getConversationSpeechResponse(norm, lang),
    };
  }

  // Fallback intelligent conversation handling (never just a blind static rejection)
  return {
    intent: 'NORMAL_CONVERSATION',
    confidence: 0.70,
    rawText: rawTranscript,
    normalizedText: norm,
    detectedLanguage: lang,
    speechResponse: getIntelligentFallbackResponse(norm, lang),
  };
}

// ---------------- Response Generators ----------------

export function getEmergencySpeechResponse(lang: Language): string {
  switch (lang) {
    case 'rw':
      return "Ubutabazi burahamagawe. SoberWatch igiye guhamagara muri segonda icumi. Niba wibeshye vuga 'Hagarika'.";
    case 'fr':
      return "Appel d'urgence en cours. Appel dans dix secondes. Dites 'Annuler' pour interrompre.";
    case 'sw':
      return "Simu ya dharura inawashwa. Simu itapigwa baada ya sekunde kumi. Sema 'Sitisha' kama unataka kughairi.";
    case 'en':
    default:
      return "Emergency response activated. Dispatching emergency call in 10 seconds. Say 'Cancel' to abort.";
  }
}

export function getCancelSpeechResponse(lang: Language): string {
  switch (lang) {
    case 'rw':
      return "Ubutabazi buhagaritswe. Nta kibazo, ubu uri mu mutekano.";
    case 'fr':
      return "Appel d'urgence annulé. Vous êtes en sécurité.";
    case 'sw':
      return "Dharura imesitishwa. Uko salama sasa.";
    case 'en':
    default:
      return "Emergency cancelled. You are safe.";
  }
}

export function getCallContactSpeechResponse(contactName: string, lang: Language): string {
  switch (lang) {
    case 'rw':
      return `Ngiye guhamagara ${contactName}. Niba ushaka guhagarika, vuga 'Hagarika'.`;
    case 'fr':
      return `Appel en cours vers ${contactName}. Dites 'Annuler' pour interrompre.`;
    case 'sw':
      return `Ninapiga simu kwa ${contactName}. Sema 'Sitisha' kuzuia.`;
    case 'en':
    default:
      return `Calling ${contactName} now. Say 'Cancel' to abort.`;
  }
}

export function getHealthSpeechResponse(reading: TelemetryReading | null, lang: Language): string {
  const hr = reading?.heartRateBpm ?? 72;
  const spo2 = reading?.spo2Percent ?? 98;
  const status = reading?.status || 'SAFE';

  switch (lang) {
    case 'rw':
      if (status === 'SAFE') {
        return `Umutima wawe uri gutera ku muvuduko wa mirongo ${hr} ku munota, umwuka wa ogisijeni ni ku ijana ${spo2}. Ubuzima bwawe bumeze neza cyane.`;
      } else {
        return `Icyitonderwa: Umutima wawe uri ku bipimo bya ${hr}, igipimo kiri hejuru. Nyamuneka ruhuka gato kandi unywe amazi.`;
      }
    case 'fr':
      return `Votre rythme cardiaque est de ${hr} battements par minute, avec une saturation d'oxygène à ${spo2} pourcent. Votre état est ${status === 'SAFE' ? 'stable' : 'sous vigilance'}.`;
    case 'sw':
      return `Mapigo yako ya moyo ni ${hr} kwa dakika, na kiwango cha oksijeni ni asilimia ${spo2}. Hali yako ya afya ni ${status === 'SAFE' ? 'nzuri sana' : 'inahitaji tahadhari'}.`;
    case 'en':
    default:
      return `Your heart rate is ${hr} beats per minute, and oxygen saturation is ${spo2} percent. Overall health status is ${status.toLowerCase()}.`;
  }
}

export function getAlcoholSpeechResponse(reading: TelemetryReading | null, lang: Language): string {
  const bac = reading?.alcoholBac ?? 0.0;

  switch (lang) {
    case 'rw':
      if (bac <= 0.02) {
        return `Igipimo cyawe cy'inzoga ni zeru n'ibice ${Math.round(bac * 100)}. Nta nzoga ziri mu maraso yawe, uri muzima.`;
      } else if (bac <= 0.08) {
        return `Igipimo cyawe cy'inzoga ni zeru n'ibice ${Math.round(bac * 100)}. Ufite inzoga nke mu maraso, witonde.`;
      } else {
        return `Icyitonderwa gikomeye: Igipimo cyawe cy'inzoga kigeze kuri zeru n'ibice ${Math.round(bac * 100)}. Birabujijwe gutwara imodoka!`;
      }
    case 'fr':
      return `Votre taux d'alcoolémie actuel est de ${bac.toFixed(2)} pourcent BAC. ${bac > 0.05 ? 'Attention: vous dépassez la limite légale.' : 'Vous êtes sobre.'}`;
    case 'sw':
      return `Kiwango chako cha pombe ni ${bac.toFixed(2)} BAC. ${bac > 0.05 ? 'Tahadhari: Usiendeshe chombo chochote cha moto.' : 'Uko salama.'}`;
    case 'en':
    default:
      return `Your current blood alcohol content is ${bac.toFixed(2)} percent. ${bac > 0.05 ? 'Warning: you are over the safe driving threshold.' : 'You are sober.'}`;
  }
}

export function getDrivingSpeechResponse(reading: TelemetryReading | null, lang: Language): string {
  const bac = reading?.alcoholBac ?? 0.0;
  const hr = reading?.heartRateBpm ?? 72;
  const isSafe = bac < 0.04 && hr < 115;

  switch (lang) {
    case 'rw':
      if (isSafe) {
        return "Yego, igipimo cyawe cy'inzoga kiri munsi y'urugero rubujijwe kandi umutima umeze neza. Ushobora gutwara imodoka mu mutekano.";
      } else {
        return "Oya, ntushobora gutwara imodoka muri aka kanya kuko igipimo cyawe cy'inzoga cyangwa umuvuduko w'umutima bitameze neza. Rinda ubuzima bwawe.";
      }
    case 'fr':
      return isSafe 
        ? "Oui, vos paramètres biométriques sont stables. Vous pouvez prendre le volant en toute sécurité."
        : "Non, il est fortement déconseillé de conduire actuellement pour votre sécurité.";
    case 'sw':
      return isSafe
        ? "Ndiyo, vipimo vyako ni salama. Unaweza kuendesha gari kwa usalama."
        : "Hapana, haushauriwi kuendesha gari sasa hivi. Linda usalama wako.";
    case 'en':
    default:
      return isSafe
        ? "Yes, your biometrics and sobriety are within safe limits. You are clear to drive."
        : "No, you are currently not in a safe condition to drive. Please arrange alternative transport.";
  }
}

export function getLocationSpeechResponse(lang: Language): string {
  switch (lang) {
    case 'rw':
      return "Aho uri hamenyekanye binyuze muri GPS ya telefone yawe. Igihe cyose ukeneye ubutabazi, agace uherereyemo gahita koherezwa ku bakozi b'ubutabazi.";
    case 'fr':
      return "Votre position GPS est synchronisée et prête à être partagée en cas de besoin de secours.";
    case 'sw':
      return "Eneo lako la GPS limenakiliwa na liko tayari kutumwa kwa wasaidizi wako.";
    case 'en':
    default:
      return "Your GPS location is tracked and ready to be automatically dispatched with emergency services.";
  }
}

export function getDailyReportSpeechResponse(reading: TelemetryReading | null, lang: Language): string {
  const hr = reading?.heartRateBpm ?? 72;
  const bac = reading?.alcoholBac ?? 0.0;

  switch (lang) {
    case 'rw':
      return `Raporo y'uyu munsi: Igipimo cy'inzoga kiri kuri ${bac.toFixed(2)}, umutima uri gutera ku bipimo ${hr}. Umutekano wawe uhagaze neza 100%.`;
    case 'fr':
      return `Rapport du jour: Taux d'alcool à ${bac.toFixed(2)}, fréquence cardiaque moyenne à ${hr} bpm. Statut global optimal.`;
    case 'sw':
      return `Ripoti ya leo: Kiwango cha pombe ni ${bac.toFixed(2)}, mapigo ya moyo ${hr}. Usalama wako ni asilimia mia moja.`;
    case 'en':
    default:
      return `Daily report summary: BAC at ${bac.toFixed(2)}, heart rate at ${hr} bpm. Overall safety score is 100%.`;
  }
}

export function getHelpSpeechResponse(lang: Language): string {
  switch (lang) {
    case 'rw':
      return "Ushobora kumbwira amagambo nka: 'Reba uko meze', 'Mbwira BAC yanjye', 'Hamagara John', 'Fata location yanjye', cyangwa 'Ubutabazi'.";
    case 'fr':
      return "Vous pouvez dire: 'Vérifie ma santé', 'Quel est mon taux d'alcool', 'Appelle Jean', ou 'Urgence'.";
    case 'sw':
      return "Unaweza kusema: 'Angalia afya yangu', 'Kiwango cha pombe', 'Piga simu kwa John', au 'Msaada wa dharura'.";
    case 'en':
    default:
      return "You can say commands like: 'Check my health', 'What is my BAC', 'Call John', 'Get my location', or 'Emergency'.";
  }
}

export function getConversationSpeechResponse(normText: string, lang: Language): string {
  switch (lang) {
    case 'rw':
      return "Muraho! Ndi SoberWatch Voice Assistant. Niteguye kugufasha no kurinda umutekano wawe.";
    case 'fr':
      return "Bonjour! Je suis l'assistant vocal SoberWatch. N'hésitez pas si vous avez besoin d'aide.";
    case 'sw':
      return "Jambo! Mimi ni SoberWatch Assistant. Niko tayari kukusaidia.";
    case 'en':
    default:
      return "Hello! I am your SoberWatch AI Assistant, ready to assist and keep you safe.";
  }
}

export function getIntelligentFallbackResponse(text: string, lang: Language): string {
  switch (lang) {
    case 'rw':
      return `Nabyumvise: "${text}". Ushobora kumbaza uko umutima umeze, igipimo cy'inzoga, cyangwa guhamagara ubutabazi.`;
    case 'fr':
      return `J'ai bien entendu: "${text}". Vous pouvez me demander votre santé, votre taux d'alcool, ou passer un appel d'urgence.`;
    case 'sw':
      return `Nimesikia: "${text}". Unaweza kuniuliza kuhusu afya yako, pombe, au kupiga simu ya dharura.`;
    case 'en':
    default:
      return `I heard: "${text}". You can ask about your vitals, sobriety status, or trigger emergency calling.`;
  }
}

/**
 * Maps specific error codes to user-friendly spoken explanations.
 */
export function getVoiceErrorMessage(code: VoiceErrorCode, lang: Language): string {
  switch (code) {
    case 'NO_MICROPHONE_PERMISSION':
      switch (lang) {
        case 'rw': return 'Uburenganzira bwa microphone burakenewe. Nyamuneka bufungure muri settings za telefone.';
        case 'fr': return 'Accès au microphone requis. Veuillez activer la permission dans les réglages.';
        case 'sw': return 'Ruhusa ya maikrofoni inahitajika. Tafadhali fungua katika mipangilio.';
        case 'en': default: return 'Microphone permission is required. Please grant access in your device settings.';
      }
    case 'NO_SPEECH':
      switch (lang) {
        case 'rw': return 'Nta jwi ryumviswe. Nyamuneka kanda kuri microphone maze uvuge.';
        case 'fr': return 'Aucune voix détectée. Veuillez appuyer sur le micro et parler.';
        case 'sw': return 'Sauti haikusikika. Bonyeza maikrofoni na uongee.';
        case 'en': default: return 'No speech was heard. Tap the microphone and speak again.';
      }
    case 'NETWORK_ERROR':
      switch (lang) {
        case 'rw': return 'Habaye ikibazo cya interineti muri speech recognition. Nyamuneka ongera ugerageze.';
        case 'fr': return 'Problème de connexion réseau avec la reconnaissance vocale.';
        case 'sw': return 'Hitilafu ya mtandao katika utambuzi wa sauti.';
        case 'en': default: return 'Network error connecting to speech recognition service.';
      }
    case 'RECOGNIZER_ERROR':
      switch (lang) {
        case 'rw': return 'Habaye ikibazo cyo gufata ijwi. Nyamuneka ongera ugerageze.';
        case 'fr': return 'Erreur du capteur de reconnaissance vocale.';
        case 'sw': return 'Hitilafu katika utambuzi wa sauti.';
        case 'en': default: return 'Audio recognition encountered an error. Please try again.';
      }
    case 'STT_UNAVAILABLE':
      switch (lang) {
        case 'rw': return 'Speech Recognition ntabwo iboneka kuri iki gikoresho. Koresha uburyo bwo kwandika.';
        case 'fr': return 'La reconnaissance vocale n\'est pas supportée sur ce système.';
        case 'sw': return 'Utambuzi wa sauti haupatikani kwenye kifaa hiki.';
        case 'en': default: return 'Speech recognition is not supported on this browser or webview.';
      }
    case 'EMPTY_TRANSCRIPT':
      switch (lang) {
        case 'rw': return 'Sinabyumvise neza. Ongera usubiremo.';
        case 'fr': return 'Je n\'ai pas bien compris. Veuillez répéter.';
        case 'sw': return 'Sikuelewa vizuri. Tafadhali rudia tena.';
        case 'en': default: return 'I didn\'t catch that. Please repeat.';
      }
    case 'AI_ERROR':
      switch (lang) {
        case 'rw': return 'Habaye ikibazo mu gusesengura amagambo. Ongera usubiremo.';
        case 'fr': return 'Erreur temporaire du service d\'intelligence vocale.';
        case 'sw': return 'Hitilafu katika kuchanganua sauti.';
        case 'en': default: return 'Could not process the command with AI service. Please repeat.';
      }
    case 'TOOL_ERROR':
      switch (lang) {
        case 'rw': return 'Igikorwa cyasabwe ntabwo gishobotse muri aka kanya.';
        case 'fr': return 'Impossible d\'exécuter l\'action demandée actuellement.';
        case 'sw': return 'Haikuweza kutekeleza tendo lililoombwa.';
        case 'en': default: return 'Unable to complete the requested action right now.';
      }
    case 'TTS_ERROR':
      switch (lang) {
        case 'rw': return 'Habaye ikibazo cyo gusoma ijwi.';
        case 'fr': return 'Erreur de synthèse vocale.';
        case 'sw': return 'Hitilafu ya sauti.';
        case 'en': default: return 'Text to speech synthesis encountered an error.';
      }
    default:
      return 'Voice error occurred.';
  }
}
