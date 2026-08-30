import {
  AgentTurnResult,
  AgentContextSources,
  EmergencyContact,
  Language,
  VoiceIntent,
  VoiceIntentMatch,
  VoiceIntentEntity,
} from '../types';
import { conversationMemory } from './conversationMemory';
import { correctSpeech } from './speechCorrector';
import { resolveContact } from './contactResolver';
import { executeAgentTool, setAgentContextSources, toolGetCurrentBAC, toolGetHeartbeat, toolGetSpO2, toolGetTemperature, toolGetDrivingReadiness, toolGetDeviceStatus, toolGetRecentAlerts } from './agentTools';
import { normalizeVoiceText, detectLanguage as detectLang } from './voiceIntentService';

/**
 * SoberWatch AI agent.
 *
 * Two engines:
 *  1. LLM engine (Gemini) with real function calling when
 *     VITE_GEMINI_API_KEY is configured. The model reasons over context, decides
 *     which SoberWatch tools are relevant, and produces a natural response.
 *  2. Deterministic reasoning engine (offline fallback) that still keeps context,
 *     corrects speech, resolves contacts, calls real tools and never fabricates.
 */

export function isAIConfigured(): boolean {
  return Boolean(geminiApiKey());
}

function geminiApiKey(): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> })?.env ?? {};
    return (env.VITE_GEMINI_API_KEY as string | undefined)?.trim() || '';
  } catch {
    return '';
  }
}

/**
 * Web search is only available when the approved Gemini web-search tool is
 * configurable (i.e. an AI key is present). Never claim a web search happened
 * unless this is true.
 */
export function isWebSearchConfigured(): boolean {
  return isAIConfigured();
}

export function wireAgentContext(sources: AgentContextSources) {
  setAgentContextSources(sources);
}

// ---------------------------------------------------------------------------
// Natural response helpers (per language)
// ---------------------------------------------------------------------------

type L = Language;

function pick(lang: Language, map: Record<L, string>, fallback = 'en'): string {
  return map[lang] || map[fallback as L] || String(map.en || '');
}

function friendlyBac(value: number): string {
  return `${value.toFixed(3)} g/L`;
}

function bacSentence(bac: number | null | undefined, lang: Language): string {
  if (bac === null || bac === undefined) return pick(lang, {
    en: 'I do not have a current BAC reading yet.',
    rw: 'Nta gipimo cy’inzoga giheruka ngifite ubu.',
    fr: "Je n'ai pas encore de mesure d'alcoolémie actuelle.",
    sw: 'Sina kipimo cha sasa cha kiwango cha pombe.',
  });
  const status = bac >= 0.08 ? 'danger' : bac >= 0.02 ? 'caution' : 'safe';
  const statusText = pick(lang, {
    en: status === 'danger' ? 'This is above a safe driving limit.' : status === 'caution' ? 'This is moving away from a safe range.' : 'Within the safe range.',
    rw: status === 'danger' ? 'Ibi birenze igipimo gikemewe cyo gutwara.' : status === 'caution' ? 'Ibi biragenda biva kuri gipimo cyiza.' : 'Kiri mu gipimo cyiza.',
    fr: status === 'danger' ? "Ce taux dépasse la limite autorisée pour conduire." : status === 'caution' ? "Ce taux s'éloigne de la plage sûre." : 'Dans la plage sûre.',
    sw: status === 'danger' ? 'Kiwango hiki kinazidi kikomo kilicho halali cha kuendesha.' : status === 'caution' ? 'Kiwango hiki kinatoka kwenye anuwai salama.' : 'Kimo katika anuwai salama.',
  });
  return pick(lang, {
    en: `Your current BAC is ${friendlyBac(bac)}. ${statusText}`,
    rw: `Igipimo cy'inzoga cyawe ubu ni ${friendlyBac(bac)}. ${statusText}`,
    fr: `Votre alcoolémie actuelle est de ${friendlyBac(bac)}. ${statusText}`,
    sw: `Kiwango chako cha sasa cha pombe ni ${friendlyBac(bac)}. ${statusText}`,
  });
}

function heartbeatSentence(lang: Language): string {
  const result = toolGetHeartbeat();
  if (!result.ok || !result.data || (result.data as { currentHeartRate: number | null }).currentHeartRate === null) {
    return pick(lang, {
      en: 'I do not have a current heart rate reading right now.',
      rw: 'Nta bipimo by’umutima ubu ngifite.',
      fr: "Je n'ai pas de lecture de fréquence cardiaque actuelle pour le moment.",
      sw: 'Sina kipimo cha sasa cha mapigo ya moyo kwa sasa.',
    });
  }
  const data = result.data as {
    currentHeartRate: number;
    recentTrend: number | null;
    personalBaseline: number | null;
    recentMin: number | null;
    recentMax: number | null;
    dataQuality: string;
  };
  const hr = Math.round(data.currentHeartRate);
  const baseline = data.personalBaseline === null ? null : Math.round(data.personalBaseline);
  const deviation = baseline !== null ? Math.abs(hr - baseline) : null;
  const comparison = baseline !== null
    ? deviation <= 12
      ? pick(lang, { en: `That's in line with your recent baseline of about ${baseline}.`, rw: `Ibi bihuye n'igipimo cyawe cyisanzwe cya hafi ${baseline}.`, fr: `Cela correspond à votre base récente d'environ ${baseline}.`, sw: `Hii inafanana na wastani yako ya kawaida ya ${baseline}.` })
      : pick(lang, { en: `Your current heart rate is different from your recent baseline of about ${baseline}.`, rw: `Umutima wawe ubu utera utandukanye n'igipimo cyisanzwe cya hafi ${baseline}.`, fr: `Votre fréquence cardiaque actuelle diffère de votre base récente d'environ ${baseline}.`, sw: `Mapigo yako ya sasa yanatofautiana na wastani yako ya kawaida ya karibu ${baseline}.` })
    : pick(lang, { en: "I don't have enough history to compare it to a personal baseline yet.", rw: 'Nta mateka ahagije yo kugereranya.', fr: "Je n'ai pas encore assez d'historique pour comparer à une base personnelle.", sw: 'Sina historia ya kutosha kulinganisha bado.' });

  const qualityNote = data.dataQuality === 'limited'
    ? pick(lang, { en: ' I only have a few readings so far, so this is a rough comparison.', rw: ' Nantabwo earth ngize ibipimo bike, ntabwo ari ukugereranya nyabyo.', fr: " Je n'ai que quelques mesures, cette comparaison reste approximative.", sw: ' Nina vipimo vichache tu, hii ni makadirio tu.' })
    : '';

  return pick(lang, {
    en: `Your current heart rate is ${hr} beats per minute. ${comparison}${qualityNote}`,
    rw: `Umutima wawe utera inshuro ${hr} ku munota. ${comparison}${qualityNote}`,
    fr: `Votre fréquence cardiaque actuelle est de ${hr} battements par minute. ${comparison}${qualityNote}`,
    sw: `Mapigo yako ya moyo ni ${hr} kwa dakika. ${comparison}${qualityNote}`,
  });
}

function spo2Sentence(lang: Language): string {
  const result = toolGetSpO2();
  if (!result.ok || result.data === null) {
    return pick(lang, { en: 'I do not have a current SpO2 reading right now.', rw: 'Nta kipimo cya SpO2 ngifite ubu.', fr: "Je n'ai pas de mesure actuelle de SpO2.", sw: 'Sina kipimo cha sasa cha SpO2.' });
  }
  const data = result.data as { currentSpO2: number; recentMin: number | null; recentMax: number | null; sampleCount: number };
  return pick(lang, {
    en: `Your current blood oxygen is ${data.currentSpO2} percent.${data.recentMin !== null ? ` Recent readings ranged from ${data.recentMin} to ${data.recentMax} percent.` : ''}`,
    rw: `Ongerwe ya ogisijeni mu maraso yawe ubu ni ${data.currentSpO2} ku ijana.${data.recentMin !== null ? ` Ibipimo bya hafi byagiye biva kuri ${data.recentMin} kugeza kuri ${data.recentMax} ku ijana.` : ''}`,
    fr: `Votre oxygène sanguin actuel est de ${data.currentSpO2} pour cent.${data.recentMin !== null ? ` Les mesures récentes vont de ${data.recentMin} à ${data.recentMax} pour cent.` : ''}`,
    sw: `Oksijeni yako ya sasa katika damu ni ${data.currentSpO2} asilimia.${data.recentMin !== null ? ` Vipimo vya hivi karibuni vilitoka ${data.recentMin} hadi ${data.recentMax} asilimia.` : ''}`,
  });
}

function temperatureSentence(lang: Language): string {
  const result = toolGetTemperature();
  if (!result.ok || result.data === null) {
    return pick(lang, { en: 'I do not have a current temperature reading right now.', rw: 'Nta kipimo cy’ubushyuhe ngifite ubu.', fr: "Je n'ai pas de mesure actuelle de température.", sw: 'Sina kipimo cha sasa cha joto.' });
  }
  const data = result.data as { currentTemperature: number; recentMin: number | null; recentMax: number | null };
  return pick(lang, {
    en: `Your current temperature is ${data.currentTemperature} degrees Celsius.${data.recentMin !== null ? ` Recently it ranged from ${data.recentMin} to ${data.recentMax} degrees.` : ''}`,
    rw: `Ubushyuhe bwawe ubu ni ${data.currentTemperature} dogere.${data.recentMin !== null ? ` Mu gihe gishIZE bari biva kuri ${data.recentMin} kugeza kuri ${data.recentMax} dogere.` : ''}`,
    fr: `Votre température actuelle est de ${data.currentTemperature} degrés Celsius.${data.recentMin !== null ? ` Récemment elle oscillait entre ${data.recentMin} et ${data.recentMax} degrés.` : ''}`,
    sw: `Joto lako la sasa ni ${data.currentTemperature} nyuzi.${data.recentMin !== null ? ` Hivi karibuni lilikuwa kati ya ${data.recentMin} na ${data.recentMax} nyuzi.` : ''}`,
  });
}

function drivingSentence(lang: Language): string {
  const result = toolGetDrivingReadiness();
  if (!result.ok) {
    return pick(lang, { en: "I don't have a current BAC reading, so I can't evaluate driving readiness right now.", rw: "Nta gipimo cy'inzoga, ntabwo nshobora kureba niba ushobora gutwara.", fr: "Je n'ai pas de mesure d'alcoolémie, je ne peux donc pas évaluer l'aptitude à conduire.", sw: 'Sina kipimo cha pombe, siwezi kutathmini uwezo wa kuendesha sasa.' });
  }
  const data = result.data as { bac: number; ready: boolean; recommended: string };
  if (!data.ready) {
    return pick(lang, {
      en: `It is not safe to drive right now. Your BAC is ${friendlyBac(data.bac)}, which is above the legal limit. Please do not drive.`,
      rw: `Ntibikwiye gutwara ubu. Igipimo cy'inzoga cyawe ni ${friendlyBac(data.bac)}, kirenze igipimo cyemewe. Witware imodoka.`,
      fr: `Il n'est pas prudent de conduire maintenant. Votre alcoolémie est de ${friendlyBac(data.bac)}, au-dessus de la limite légale. Ne conduisez pas.`,
      sw: `Si salama kuendesha sasa. Kiwango chako cha pombe ni ${friendlyBac(data.bac)}, juu ya kikomo halali. Tafadhali usiendeshe.`,
    });
  }
  return pick(lang, {
    en: `You're within the legal limit with a BAC of ${friendlyBac(data.bac)}, so you're safe to drive.`,
    rw: `Igipimo cy'inzoga cyawe ni ${friendlyBac(data.bac)}, wumviriza kuruhusiwa gutwara.`,
    fr: `Votre alcoolémie est de ${friendlyBac(data.bac)}, vous pouvez conduire en sécurité.`,
    sw: `Kiwango chako cha pombe ni ${friendlyBac(data.bac)}, uko salama kuendesha.`,
  });
}

function deviceSentence(lang: Language): string {
  const result = toolGetDeviceStatus();
  const data = result.ok ? (result.data as { deviceId: string | null; lastReadingAt: number | null; online: boolean; sensorDataPresent: boolean }) : null;
  if (!data || !data.sensorDataPresent) {
    return pick(lang, { en: 'I do not see recent data from your SoberWatch device yet.', rw: 'Nta makuru aheruka avuye ku kinyabiziga cyawe cya SoberWatch ntabone.', fr: "Je ne vois pas encore de données récentes de votre appareil SoberWatch.", sw: 'Sijaona data ya hivi karibuni kutoka kwa kifaa chako cha SoberWatch.' });
  }
  const id = data.deviceId || 'your device';
  return pick(lang, {
    en: `Your SoberWatch device (${id}) sent its latest reading recently.`,
    rw: `Igikoresho cyawe cya SoberWatch (${id}) cyatumawe igipimo cya nyuma.`,
    fr: `Votre appareil SoberWatch (${id}) a envoyé sa dernière mesure récemment.`,
    sw: `Kifaa chako cha SoberWatch (${id}) kimetuma kipimo chake cha mwisho hivi karibuni.`,
  });
}

function alertsSentence(lang: Language): string {
  const result = toolGetRecentAlerts();
  const data = result.ok ? (result.data as { recentEvents: Array<{ type: string; state: string; timestamp: string }>; currentStatusIsCritical: boolean; currentStatus: string }) : null;
  if (result.ok && data) {
    const count = data.recentEvents.length;
    if (count === 0) {
      return pick(lang, { en: 'There are no recent emergency events on record.', rw: 'Nta bice by’ubutabazi bibonetse.', fr: "Aucun événement d'urgence récent enregistré.", sw: 'Hakuna matukio ya dharura yaliyorekodiwa.' });
    }
    const critical = data.currentStatusIsCritical ? pick(lang, { en: ' Your latest reading is marked critical, so please take it seriously and get help if needed.', rw: ' Igipimo cyawe cyanyuma kirangwa nk’ikibabaje cyane, kandi usabwe kugira ubufasha.', fr: ' Votre dernière mesure est marquée critique, prenez-la au sérieux.', sw: ' Kipimo chako cha mwisho kinatambuliwa kuwa hatarishi, tafadhali chukulia kwa uzito.' }) : '';
    return pick(lang, {
      en: `There ${count === 1 ? 'has been' : 'have been'} ${count} recent emergency event${count === 1 ? '' : 's'}.${critical}`,
      rw: `Hari ${count} ibice by’ubutabazi byabaye.${critical}`,
      fr: `Il y a eu ${count} événement${count > 1 ? 's' : ''} d'urgence récemment.${critical}`,
      sw: `Kumekuwa na matukio ${count} ya dharura hivi karibuni.${critical}`,
    });
  }
  return pick(lang, { en: "I couldn't load recent alerts.", rw: 'Sinashoboye kubona amabwiriza aheruka.', fr: "Je n'ai pas pu charger les alertes récentes.", sw: 'Sikuweza kupakia arifa za hivi karibuni.' });
}

function reportSentence(lang: Language, period: 'daily' | 'weekly' | 'monthly'): string {
  const result = executeAgentTool(period === 'daily' ? 'getDailyReport' : period === 'weekly' ? 'getWeeklyReport' : 'getMonthlyReport');
  if (!result.ok) {
    const base = period === 'daily' ? pick(lang, { en: 'There are no readings available for today yet.', rw: 'Nta bipimo byanditswe uyu munsi.', fr: 'Aucune mesure disponible aujourd’hui pour le moment.', sw: 'Hakuna vipimo vilivyopatikana leo bado.' }) : period === 'weekly' ? pick(lang, { en: 'There are no readings available for the last 7 days.', rw: 'Nta bipimo byanditswe mu byumweru 7 bishize.', fr: 'Aucune mesure pour les 7 derniers jours.', sw: 'Hakuna vipimo kwa siku 7 zilizopita.' }) : pick(lang, { en: 'There are no readings available for this month yet.', rw: 'Nta bipimo byanditswe muri uku kwezi.', fr: 'Aucune mesure pour ce mois-ci pour le moment.', sw: 'Hakuna vipimo kwa mwezi huu bado.' });
    return base;
  }
  const d = result.data as { averageBac: number | null; highestBac: number | null; averageHeartRate: number | null; safe: number; caution: number; danger: number; trend: string; dataQuality: number | null };
  const periodLabel = pick(lang, { en: 'daily report', rw: 'raporo ya buri munsi', fr: 'rapport quotidien', sw: 'ripoti ya kila siku' });
  const readonly = [
    d.averageBac !== null ? `${pick(lang, { en: 'average BAC', rw: 'BAC isanzwe', fr: 'alcoolémie moyenne', sw: 'kiwango cha wastani cha pombe' })} ${friendlyBac(d.averageBac)}` : null,
    d.averageHeartRate !== null ? `${pick(lang, { en: 'average heart rate', rw: 'umutima usanzwe', fr: 'fréquence cardiaque moyenne', sw: 'mapigo ya wastani ya moyo' })} ${Math.round(d.averageHeartRate)}` : null,
  ].filter(Boolean).join(', ');
  const shape = d.danger > 0
    ? pick(lang, { en: `${d.danger} elevated reading${d.danger > 1 ? 's' : ''} were recorded`, rw: `habonetse ibipimo ${d.danger} bya hambere`, fr: `${d.danger} mesure${d.danger > 1 ? 's' : ''} élevée${d.danger > 1 ? 's' : ''} enregistrée${d.danger > 1 ? 's' : ''}`, sw: `vipimo vikuu ${d.danger} vilirekodiwa` })
    : d.trend === 'up'
      ? pick(lang, { en: 'your alcohol trend moved up across the period', rw: 'inzoga zara zibaye nyinshi', fr: 'votre tendance alcool a augmenté', sw: 'mwiringo wa pombe uliongezeka' })
      : pick(lang, { en: 'your readings stayed within the lower-risk range', rw: 'ibipimo byawe byagumye ku rwego rwiza', fr: 'vos mesures sont restées dans la plage à faible risque', sw: 'vipimo vyako vilikaa kwenye anuwai salama' });
  return pick(lang, {
    en: `Here is your ${periodLabel}: ${readonly}. ${shape}.`,
    rw: `Dore raporo y'amakuru ${periodLabel}: ${readonly}. ${shape}.`,
    fr: `Voici votre ${periodLabel}: ${readonly}. ${shape}.`,
    sw: `Hii ni ${periodLabel} yako: ${readonly}. ${shape}.`,
  });
}

function locationSentence(lang: Language): string {
  return pick(lang, {
    en: 'I can fetch your current GPS location. Do you want me to share it with your emergency contact?',
    rw: 'Nshobora gushaka aho uri kuri GPS. Ushaka ko ngabana na contact yawe y’ubutabazi?',
    fr: 'Je peux obtenir votre position GPS actuelle. Voulez-vous que je la partage avec votre contact d’urgence ?',
    sw: 'Naweza kupata eneo lako la sasa la GPS. Unataka nikushiriki na mawasiliano yako ya dharura?',
  });
}

function helpSentence(lang: Language): string {
  return pick(lang, {
    en: 'You can ask me how you are doing, about your heart rate, BAC, driving readiness, your contacts, or recent alerts. For help, just say "help" or "call emergency" any time.',
    rw: 'Ushobora kumbaza uko umeze, umutima wawe, BAC, gutwara, contact zawe cyangwa amabwiriza. Vuga "ubufasha" cyangwa "hamagara ubutabazi" igihe cyose.',
    fr: 'Demandez-moi comment vous allez, votre fréquence cardiaque, votre alcoolémie, votre aptitude à conduire, vos contacts ou vos alertes récentes.',
    sw: 'Unaweza kuniuliza hali yako, mapigo ya moyo, kiwango cha pombe, hali ya kuendesha, mawasiliano yako au arifa za hivi karibuni.',
  });
}

function unknownSentence(lang: Language): string {
  return pick(lang, {
    en: 'I did not quite catch that. Could you repeat it?',
    rw: 'Sinabyumvise neza. Ushobora kukibisubiramo?',
    fr: "Je n'ai pas bien compris. Pouvez-vous répéter ?",
    sw: 'Sikuelewa vizuri. Unaweza kurudia?',
  });
}

function emergencySentence(lang: Language): string {
  return pick(lang, {
    en: 'Got it. I will start the emergency call with a short countdown. Say "cancel" if this was a mistake.',
    rw: "Nabyumvise. Ndi gutangiza guhamagara ubutabazi. Vuga 'hagarika' niba atari emergency.",
    fr: "Compris. Je lance l'appel d'urgence avec un court décompte. Dites « annuler » si c'était une erreur.",
    sw: 'Nimeelewa. Nitaanzisha simu ya dharura na hesabu fupi. Sema "sitisha" kama ilikuwa kosa.',
  });
}

function confirmCallSentence(contact: { name: string; phone: string }, lang: Language): string {
  return pick(lang, {
    en: `I found ${contact.name} (${contact.phone}). Should I call them?`,
    rw: `Nabaze ${contact.name} (${contact.phone}). Nshobora kumuhamagara?`,
    fr: `J'ai trouvé ${contact.name} (${contact.phone}). Dois-je les appeler ?`,
    sw: `Nimepata ${contact.name} (${contact.phone}). Je nimpige?`,
  });
}

function callBeginSentence(contact: { name: string }, lang: Language): string {
  return pick(lang, {
    en: `I found ${contact.name}. Starting the call now.`,
    rw: `Nabaze ${contact.name}. Ndimo guhamagara.`,
    fr: `J'ai trouvé ${contact.name}. Je lance l'appel.`,
    sw: `Nimepata ${contact.name}. Ninaanza kupiga simu.`,
  });
}

function noContactSentence(lang: Language): string {
  return pick(lang, {
    en: 'I could not find that person in your emergency contacts. Please say the contact name again, or ask me to call your emergency contact.',
    rw: 'Sinabonye uwo muntu mu contact zawe. Vuga izina ryurumwe, cyangwa nyibutsa ko kumva wowe.',
    fr: "Je n'ai pas trouvé cette personne dans vos contacts d'urgence. Répétez le prénom ou demandez-moi d'appeler votre contact d'urgence.",
    sw: 'Sikumweza kumpata katika mawasiliano yako ya dharura. Tafadhali rudia jina, au uniombe kumpigia mawasiliano yako ya dharura.',
  });
}

function webSearchUnavailableSentence(lang: Language): string {
  return pick(lang, {
    en: 'I do not have an approved external web search tool configured on this device, so I cannot look that up right now.',
    rw: 'Nta kibazo, ariko nta kikoresho cyo gushakisha ku murusobe ngifite hano. Sinashobora kubisuzuma ubu.',
    fr: "Je n'ai pas d'outil de recherche web approuvé configuré sur cet appareil, je ne peux donc pas le rechercher pour le moment.",
    sw: 'Sina zana lilionidhinishwa la kutafuta mtandaoni kwenye kifaa hiki, kwa hiyo siwezi kutafuta sasa.',
  });
}

// ---------------------------------------------------------------------------
// Deterministic reasoning engine (offline fallback)
// ---------------------------------------------------------------------------

interface IntentCandidate {
  intent: VoiceIntent;
  score: number;
  topic?: string;
  period?: 'daily' | 'weekly' | 'monthly';
}

function keywordCandidates(norm: string): IntentCandidate[] {
  const list: Array<{ pattern: RegExp; intent: VoiceIntent; score: number; topic?: string; period?: 'daily' | 'weekly' | 'monthly' }> = [
      // "Call my emergency contact" is a CONTACT call, not a generic SOS. It must
      // outrank the generic emergency pattern below so it resolves to the primary
      // contact instead of starting the emergency-service workflow.
      { pattern: /\b(?:call|hamagara|mpamagarira|appeler|piga\s*simu)\b.*\b(?:emergency\s*contact|emergency\s+person|contact\s*ya\s*dharura|contact\s*d\s*urgence|urgent\s*contact)\b/i, intent: 'CALL_CONTACT', score: 1.0 },
      // Emergency — highest priority wording.
      { pattern: /\b(emergency|help\s*me|i\s+need\s+help|i\s+need\s+assistance|i\s+am\s+in\s+danger|call\s+(?:the\s+)?(112|911|999|ambulance|police|rescue|ubutabazi|secours|dharura)|ndababaye|nkeneye\s+ubufasha|ndakeneye\s+ubufasha|hamagara\s+ubutabazi|fasha|nagize\s+impanuka|accident|ndakomeretse|aidez|au\s+secours|dharura|msaada|niko\s+hatarini|ninahitaji\s+msaada|ndababaye\s+cyane|mbwira\s+ubutabazi|tanga\s+emergency|ndashaka\s+ko\s+umpamagirira|ndashaka\s+ubutabazi|ndarembye|ndakomeretse|fasha\s+ndababaye|hamagara\s+ubutabazi\s+nonaha|fasha\s+ubutabazi|nyamuneka\s+mfasha|ndafite\s+ikibazo|nagize\s+accident|nakoze\s+impanuka|ndamaze\s+ituze)\b/, intent: 'EMERGENCY_REQUEST', score: 1.0 },
      // Cancel / stop.
      { pattern: /\b(hagarika|hagarara|reka|bireke|annuler|arretez?|cancel|stop|abort|sitisha|ghairi|acha|ndi muzima|ndameze neza|sinkeneye ubufasha|hagarika guhamagara|ndi muzima|ndatemerwe|sinkeneye)\b/, intent: 'CANCEL_EMERGENCY', score: 0.95 },
      { pattern: /\b(stop\s+(?:the\s+)?call|end\s+the\s+call|hagarika\s+guhamagara|arrete\s+l\s*appel|acha\s+kupiga|reka)\b/, intent: 'STOP_CALL', score: 0.97 },
    // Contact calls — semantic: any call verb plus contact name/role, plus Kinyarwanda "kuvugana na" (talk to) and object forms "muhagare"/"muhamagare" (call him/her).
    { pattern: /\b(call|hamagara|mpamagarira|appeler|piga\b.*\bsimu|telephone|kuvugana\s+na|vugana\s+na|uvugane\s+na|ndashaka\s+kuvugana|shaka\s+kuvugana|muhagare|muhamagare|muhagarire|nguhagare|ndamuhagare|ndamuhagarire)\b/, intent: 'CALL_CONTACT', score: 0.92 },
    // Automated voice message during an outgoing call.
    { pattern: /\b(?:call|hamagara|appeler).*(?:tell\s+them|bwira|dites\s+leur|waambie)\b/, intent: 'SEND_VOICE_MESSAGE', score: 0.9 },
    // Health — reba uko meze and related Kinyarwanda health checks. Includes semantic mixed-language variants.
    { pattern: /\breba\s+uko\s+meze\b/, intent: 'CHECK_HEALTH', score: 0.96 },
    { pattern: /\bmbwira\s+uko\s+meze\b/, intent: 'CHECK_HEALTH', score: 0.95 },
    { pattern: /\buko\s+meze\s+uyu\s+munsi\b/, intent: 'CHECK_HEALTH', score: 0.94 },
    { pattern: /\buko\s+meze\b/, intent: 'CHECK_HEALTH', score: 0.88 },
    { pattern: /\breba\s+uko\s+umutima\s+wanjye\s+umeze\b/, intent: 'CHECK_HEALTH', score: 0.96 },
    { pattern: /\bubuzima\s+bwanjye\b/, intent: 'CHECK_HEALTH', score: 0.95 },
    { pattern: /\bhealth\s+yanjye\s+imeze\b/, intent: 'CHECK_HEALTH', score: 0.94 },
    { pattern: /\bmbwira\s+uko\s+health\b/, intent: 'CHECK_HEALTH', score: 0.94 },
    { pattern: /\bumutima\s+utera\b/, intent: 'CHECK_HEART_RATE', score: 0.95 },
    { pattern: /\breba\s+ubuzima\b/, intent: 'CHECK_HEALTH', score: 0.95 },
    { pattern: /\breba\s+ibipimo\b/, intent: 'CHECK_HEALTH', score: 0.95 },
    { pattern: /\bubuzima\s+bumeze\s+gute\b/, intent: 'CHECK_HEALTH', score: 0.95 },
    { pattern: /\bibipimo\s+byanjye\b/, intent: 'CHECK_HEALTH', score: 0.95 },
    { pattern: /\breba\s+raporo\s+yanjye\b/, intent: 'CHECK_REPORT', score: 0.93 },
    { pattern: /\braporo\s+yanjye\b/, intent: 'CHECK_REPORT', score: 0.93 },
    { pattern: /\braporo\b/, intent: 'CHECK_REPORT', score: 0.85 },
    { pattern: /\bheartbeat\s+yanjye\s+imeze\s+ite\b/, intent: 'CHECK_HEART_RATE', score: 0.95 },
    { pattern: /\bheartbeat\b/, intent: 'CHECK_HEART_RATE', score: 0.90 },
    { pattern: /\bheart\s*rate\b/, intent: 'CHECK_HEART_RATE', score: 0.95 },
    { pattern: /\bspo2\b/, intent: 'CHECK_SPO2', score: 0.93 },
    // Health semantic fallback: any health token combo for mixed language
    { pattern: /\b(heartbeat|umutima|health|ubuzima|ibipimo)\b.*\b(meze|imeze|bimeze|ute|ite|hanga|kuri)\b/, intent: 'CHECK_HEALTH', score: 0.87 },
    { pattern: /\b(reba|mbwira|bwira|show|tell).*?\b(heartbeat|heart|health|ubuzima|meze)\b/, intent: 'CHECK_HEALTH', score: 0.86 },
    // BAC / alcohol.
    { pattern: /\bmbwira\s+bac\s+yanjye\b/, intent: 'CHECK_ALCOHOL_STATUS', score: 0.95 },
    { pattern: /\bmbwira\s+inzego\s+yanjye\b/, intent: 'CHECK_ALCOHOL_STATUS', score: 0.95 },
    { pattern: /\breba\s+inzoga\b/, intent: 'CHECK_ALCOHOL_STATUS', score: 0.95 },
    { pattern: /\breba\s+bac\b/, intent: 'CHECK_ALCOHOL_STATUS', score: 0.94 },
    { pattern: /\bigipimo\s+cy\s*inzoga\b/, intent: 'CHECK_ALCOHOL_STATUS', score: 0.95 },
    { pattern: /\bbac\s+yanjye\b/, intent: 'CHECK_ALCOHOL_STATUS', score: 0.95 },
    { pattern: /\bbac\b/, intent: 'CHECK_ALCOHOL_STATUS', score: 0.90 },
    { pattern: /\blevel\s+yinzoga\b/, intent: 'CHECK_ALCOHOL_STATUS', score: 0.95 },
    { pattern: /\binzoga\b/, intent: 'CHECK_ALCOHOL_STATUS', score: 0.9 },
    { pattern: /\bikoresha\s+inzoga\b/, intent: 'CHECK_ALCOHOL_STATUS', score: 0.9 },
    { pattern: /\bniko\s+yinde\s+inzoga\b/, intent: 'CHECK_ALCOHOL_STATUS', score: 0.9 },
    // Driving readiness.
    { pattern: /\bnshobora\s+gutwara\b/, intent: 'CHECK_DRIVING_READINESS', score: 0.94 },
    { pattern: /\breba\s+gutwara\b/, intent: 'CHECK_DRIVING_READINESS', score: 0.94 },
    { pattern: /\bgutwara\s+imodoka\b/, intent: 'CHECK_DRIVING_READINESS', score: 0.94 },
    { pattern: /\bubushobozi\s+wo\s+gutwara\b/, intent: 'CHECK_DRIVING_READINESS', score: 0.94 },
    { pattern: /\bgutwara\s+bimeze\s+bitte\b/, intent: 'CHECK_DRIVING_READINESS', score: 0.94 },
    { pattern: /\bndatwara\b/, intent: 'CHECK_DRIVING_READINESS', score: 0.94 },
    { pattern: /\bgutwara\b/, intent: 'CHECK_DRIVING_READINESS', score: 0.9 },
    { pattern: /\bnshobora\s+kudatwara\b/, intent: 'CHECK_DRIVING_READINESS', score: 0.94 },
    { pattern: /\b(?:am\s+i|can\s+i|is\s+it\s+safe\s+to)\s*(?:okay|ok|fit|safe|able|allowed)?\s*(?:to\s+)?drive\b/, intent: 'CHECK_DRIVING_READINESS', score: 0.93 },
    { pattern: /\bcan\s+i\s+drive\b/, intent: 'CHECK_DRIVING_READINESS', score: 0.93 },
    { pattern: /\bshould\s+i\s+drive\b/, intent: 'CHECK_DRIVING_READINESS', score: 0.93 },
    { pattern: /\bdriving\s+readiness\b/, intent: 'CHECK_DRIVING_READINESS', score: 0.94 },
    // Location.
    { pattern: /\bafo\s+ndi\b/, intent: 'CHECK_LOCATION', score: 0.91 },
    { pattern: /\bndihe\b/, intent: 'CHECK_LOCATION', score: 0.91 },
    { pattern: /\breba\s+aho\s+ndi\b/, intent: 'CHECK_LOCATION', score: 0.91 },
    { pattern: /\blocation\s+yanjye\b/, intent: 'CHECK_LOCATION', score: 0.91 },
    { pattern: /\bumwanya\s+wanjye\b/, intent: 'CHECK_LOCATION', score: 0.91 },
    { pattern: /\bfata\s+location\s+yanjye\b/, intent: 'CHECK_LOCATION', score: 0.91 },
    { pattern: /\bfata\s+umwanya\s+wanjye\b/, intent: 'CHECK_LOCATION', score: 0.91 },
    { pattern: /\bfata\s+location\b/, intent: 'CHECK_LOCATION', score: 0.90 },
    { pattern: /\bfata\s+aho\s+ndi\b/, intent: 'CHECK_LOCATION', score: 0.91 },
    { pattern: /\bubu\s+uri\s+hantu\b/, intent: 'CHECK_LOCATION', score: 0.91 },
    { pattern: /\buherereye\s+aho\b/, intent: 'CHECK_LOCATION', score: 0.91 },
    { pattern: /\bngaba\s+uri\s+aho\b/, intent: 'CHECK_LOCATION', score: 0.91 },
    { pattern: /\bni\s+hantu\s+ndako\b/, intent: 'CHECK_LOCATION', score: 0.91 },
    // Reports.
    { pattern: /\bdaily\s*report|raporo\s+ya\s+buri\s+munsi|ripoti\s+ya\s+kila\s+siku\b/, intent: 'CHECK_REPORT', score: 0.93, topic: 'daily', period: 'daily' },
    { pattern: /\bweekly\s*report|raporo\s+ya\s+cyumweru|ripoti\s+ya\s+wiki\b/, intent: 'CHECK_REPORT', score: 0.93, topic: 'weekly', period: 'weekly' },
    { pattern: /\bmonthly\s*report|raporo\s+ya\s+kwezi|ripoti\s+ya\s+mwezi\b/, intent: 'CHECK_REPORT', score: 0.93, topic: 'monthly', period: 'monthly' },
    { pattern: /\breport|raporo|ripoti\b/, intent: 'CHECK_REPORT', score: 0.85, topic: 'daily', period: 'daily' },
    // Alerts.
    { pattern: /\balert|alerts|amabwiriza|arifa|alertes?\b/, intent: 'CHECK_ALERTS', score: 0.9 },
    // Device.
    { pattern: /\bdevice|sensor|status|igikoresho|kifaa\b/, intent: 'CHECK_DEVICE_STATUS', score: 0.86 },
    // Help.
    { pattern: /\b(help|ubufasha|msaada|aide|what\s+can\s+you\s+do|commands)\b/, intent: 'HELP', score: 0.9 },
    // Web search.
    { pattern: /\b(search|look\s+up|find\s+information|what\s+does.*mean|regulation|medicine|guidance)\b/, intent: 'SEARCH_WEB', score: 0.8 },
    // Conversation / greetings.
    { pattern: /\bmuraho\b/, intent: 'NORMAL_CONVERSATION', score: 0.85 },
    { pattern: /\bmwaramutse\b/, intent: 'NORMAL_CONVERSATION', score: 0.85 },
    { pattern: /\bmwiriwe\b/, intent: 'NORMAL_CONVERSATION', score: 0.85 },
    { pattern: /\bbite\b/, intent: 'NORMAL_CONVERSATION', score: 0.85 },
    { pattern: /\bjambo\b/, intent: 'NORMAL_CONVERSATION', score: 0.85 },
    { pattern: /\byego\b/, intent: 'NORMAL_CONVERSATION', score: 0.85 },
    { pattern: /\byes\b/, intent: 'NORMAL_CONVERSATION', score: 0.85 },
    { pattern: /\bsawa\b/, intent: 'NORMAL_CONVERSATION', score: 0.85 },
    // Location share.
    { pattern: /\bshare\s+(?:my\s+)?location|share\s+position|gabana\s+aho|share\s+eneo\b/, intent: 'SHARE_LOCATION', score: 0.93 },
  ];

  return list
    .filter((entry) => entry.pattern.test(norm))
    .map((entry) => ({ intent: entry.intent, score: entry.score, topic: entry.topic, period: entry.period }));
}

function semanticFallbackIntent(norm: string): { intent: VoiceIntent; score: number; entity: VoiceIntentEntity | undefined } | null {
  // Token-based semantic fallback: looks for scattered health/BAC/location tokens across mixed languages.
  const hasHealthToken = /\b(reba|mbwira|bwira|show|tell|heartbeat|heart|health|ubuzima|ibipimo|meze|imeze|bimeze|umutima|how.*am.*i|how.*is.*my)\b/.test(norm);
  const hasBacToken = /\b(bac|inzoga|alcohol|alcool|pombe|inzoga)\b/.test(norm);
  const hasLocationToken = /\b(location|aho\s+ndi|ndihe|fata|gabana|eneo|umwanya)\b/.test(norm);
  const hasCallToken = /\b(call|hamagara|mpamagarira|appeler|piga|kuvugana|vugana|muhagare|muhamagare|nguhagare|ndamuhagare|ndamuhagarire)\b/.test(norm);
  const hasEmergencyToken = /\b(emergency|ubutabazi|ndababaye|accident|impanuka|dharura|msaada)\b/.test(norm);
  // Prefer the most specific intent present in the utterance
  if (hasEmergencyToken && hasCallToken) return { intent: 'EMERGENCY_REQUEST', score: 0.85, entity: undefined };
  if (hasCallToken) return null; // CALL requires name resolution; let UNKNOWN handle clarification, not fallback to health
  if (hasBacToken) return { intent: 'CHECK_ALCOHOL_STATUS', score: 0.82, entity: undefined };
  if (hasLocationToken) return { intent: 'CHECK_LOCATION', score: 0.82, entity: undefined };
  if (hasHealthToken) return { intent: 'CHECK_HEALTH', score: 0.82, entity: undefined };
  return null;
}

function detectTopicLanguage(norm: string, fallback: Language): Language {
  const lang = detectLang(norm, fallback);
  return lang;
}

function contextContinuation(norm: string, prevIntent: VoiceIntent | undefined): { intent: VoiceIntent; hint: string } | null {
  if (!prevIntent) return null;
  if (/\b(heart|umutima|mapigo)\b/.test(norm)) {
    return { intent: 'CHECK_HEART_RATE', hint: 'follow-up: heart context' };
  }
  if (/\b(bac|inzoga|alcohol|alcool|pombe)\b/.test(norm)) {
    return { intent: 'CHECK_ALCOHOL_STATUS', hint: 'follow-up: bac context' };
  }
  if (/\b(oxygen|spo2)\b/.test(norm)) {
    return { intent: 'CHECK_SPO2', hint: 'follow-up: spo2 context' };
  }
  if (/\b(temp)\b/.test(norm)) {
    return { intent: 'CHECK_TEMPERATURE', hint: 'follow-up: temperature context' };
  }
  if (/\b(about\s+me|how\s+am\s+i|how\s+is\s+my|status)\b/.test(norm)) {
    return { intent: 'CHECK_HEALTH', hint: 'follow-up: health context' };
  }
  return null;
}

export function classifyDeterministic(
  rawText: string,
  lang: Language,
  contacts: EmergencyContact[]
): { intent: VoiceIntent; score: number; topic?: string; period?: 'daily' | 'weekly' | 'monthly' | undefined; entity: VoiceIntentEntity | undefined } {
  const correction = correctSpeech(rawText, contacts);
  const norm = normalizeVoiceText(correction.correctedText);

  if (!norm) return { intent: 'UNKNOWN_COMMAND', score: 0.4, entity: undefined };

  const detectedLang = detectTopicLanguage(norm, lang);
  const candidates = keywordCandidates(norm);

  // Prefer correction-oriented interpretation for dangerous calls: if the user
  // named someone after saying "no", treat as a CALL with the corrected name.
  if (correction.correctedName && /\b(call|hamagara|appeler|piga)/.test(norm)) {
    return {
      intent: 'CALL_CONTACT',
      score: Math.min(1, 0.8 + correction.confidence),
      entity: { contactName: correction.correctedName, contextContinuation: correction.hadCorrection ? 'user correction applied' : undefined },
    };
  }

  // Context continuation: "What about my heart?" after a health turn.
  const prev = conversationMemory.getLastUserTurn();
  if (prev && prev.intent && prev.intent !== 'UNKNOWN_COMMAND' && candidates.length <= 1) {
    const continuation = contextContinuation(norm, prev.intent);
    if (continuation && !/\b(no|oya|non|hapana)\b/.test(norm)) {
      return { intent: continuation.intent, score: 0.92, entity: { contextContinuation: continuation.hint } };
    }
  }

  if (candidates.length > 0) {
    const best = candidates.reduce((a, b) => (b.score > a.score ? b : a));

    // A "call" intent requires a resolvable contact; if we cannot resolve it we
    // either ask for clarification (dangerous) or fall through.
    if (best.intent === 'CALL_CONTACT' || best.intent === 'SEND_VOICE_MESSAGE') {
      // SEND_VOICE_MESSAGE matches whenever CALL_CONTACT does (its pattern also
      // requires a call verb) and always scores lower, so it could never win the
      // reducer. Prefer the richer intent when the user asked to deliver a
      // message on the call.
      const effectiveIntent: VoiceIntent = candidates.some((c) => c.intent === 'SEND_VOICE_MESSAGE') ? 'SEND_VOICE_MESSAGE' : best.intent;
      const resolved = resolveContact(correction.correctedText, { contacts, lastMentionedContact: lastMentionedContactEntity(contacts) });
      if (!resolved) {
        return { intent: effectiveIntent, score: 0.62, entity: { clarification: 'could not resolve contact' } };
      }
      const requiresConfirmation = resolved.requiresConfirmation || (effectiveIntent === 'CALL_CONTACT' && resolved.confidence < 0.8);
      return {
        intent: effectiveIntent,
        score: requiresConfirmation ? 0.7 : best.score,
        entity: {
          contactName: resolved.name,
          contactPhone: resolved.phone,
          contactTarget: resolved.name,
        },
      };
    }

    return { intent: best.intent, score: best.score, topic: best.topic, period: best.period, entity: undefined };
  }

  // Semantic fallback for mixed-language / conversational health queries that don't match an exact phrase
  // e.g. "Reba heartbeat yanjye hanyuma umbwire uko meze." contains health tokens scattered across languages.
  const fallback = semanticFallbackIntent(norm);
  if (fallback) return fallback;

  return { intent: 'UNKNOWN_COMMAND', score: 0.4, entity: undefined };
}

function lastMentionedContactEntity(contacts: EmergencyContact[]): EmergencyContact | null {
  const entity = conversationMemory.getEntity('contact');
  if (!entity?.name) return null;
  const found = contacts.find((c) => c.name.toLowerCase() === entity.name?.toLowerCase());
  return found || null;
}

/**
 * Build a full VoiceIntentMatch + action from deterministic classification.
 */
export function runDeterministicTurn(
  rawText: string,
  lang: Language,
  contacts: EmergencyContact[]
): AgentTurnResult {
  const classification = classifyDeterministic(rawText, lang, contacts);
  const intent = classification.intent;
  const detectedLang = classifyDeterministicLanguage(rawText, lang);
  const entity = classification.entity;
  const toolsUsed: string[] = [];

  const baseMatch = (speechResponse: string, overrides: Partial<VoiceIntentMatch> = {}): VoiceIntentMatch => ({
    intent,
    confidence: classification.score,
    rawText,
    normalizedText: normalizeVoiceText(rawText),
    detectedLanguage: detectedLang,
    extractedEntity: entity,
    speechResponse,
    toolsUsed,
    ...overrides,
  });

  function withTool(match: VoiceIntentMatch, tool: string): VoiceIntentMatch {
    if (!match.toolsUsed?.includes(tool)) match.toolsUsed = [...(match.toolsUsed || []), tool];
    return match;
  }

  switch (intent) {
    case 'EMERGENCY_REQUEST': {
      const msg = emergencySentence(detectedLang);
      return { match: baseMatch(msg, { requiresConfirmation: false }), action: 'emergency', actionTarget: { countdownSeconds: undefined } };
    }

    case 'CANCEL_EMERGENCY': {
      const msg = pick(detectedLang, {
        en: 'Cancelled. No call will be made.',
        rw: 'Byahagaritswe. Nta hamagara bizabaho.',
        fr: "Annulé. Aucun appel ne sera passé.",
        sw: 'Imesitishwa. Hakuna simu itapigwa.',
      });
      return { match: baseMatch(msg), action: 'cancel_emergency' };
    }

    case 'STOP_CALL': {
      const msg = pick(detectedLang, {
        en: 'Stopping the active call now.',
        rw: 'Ndi guhagarika call ikorana.',
        fr: "J'arrête l'appel en cours.",
        sw: 'Ninasitisha simu inayoendelea.',
      });
      return { match: baseMatch(msg), action: 'end_call' };
    }

    case 'CALL_CONTACT':
    case 'SEND_VOICE_MESSAGE': {
      const resolved = resolveContact(rawText, {
        contacts,
        lastMentionedContact: lastMentionedContactEntity(contacts),
      });
      if (!resolved) {
        const msg = noContactSentence(detectedLang);
        return { match: baseMatch(msg, { intent: 'CLARIFICATION_REQUEST', requiresConfirmation: true, extractedEntity: { clarification: 'unknown contact' } }), action: 'none' };
      }
      if (resolved.requiresConfirmation || (!resolved.phone)) {
        const msg = confirmCallSentence(resolved, detectedLang);
        conversationMemory.rememberEntity('contact', resolved.name, resolved.phone);
        return {
          match: baseMatch(msg, { requiresConfirmation: true, extractedEntity: { contactName: resolved.name, contactPhone: resolved.phone } }),
          action: 'none',
        };
      }
      conversationMemory.rememberEntity('contact', resolved.name, resolved.phone);
      conversationMemory.rememberEntity('topic', 'call');
      const msg = callBeginSentence(resolved, detectedLang);
      if (intent === 'SEND_VOICE_MESSAGE') {
        const message = buildAutomatedMessage(detectedLang, rawText);
        return {
          match: baseMatch(msg, {
            extractedEntity: { contactName: resolved.name, contactPhone: resolved.phone, message },
          }),
          action: 'call',
          actionTarget: { name: resolved.name, phone: resolved.phone, message },
        };
      }
      return {
        match: baseMatch(msg, { extractedEntity: { contactName: resolved.name, contactPhone: resolved.phone } }),
        action: 'call',
        actionTarget: { name: resolved.name, phone: resolved.phone },
      };
    }

    case 'SHARE_LOCATION': {
      const msg = pick(detectedLang, {
        en: 'I am getting a fresh GPS fix now.',
        rw: 'Ndimo gufata aho uri kuri GPS.',
        fr: "J'obtiens une position GPS fraîche maintenant.",
        sw: 'Ninatengeneza eneo jipya la GPS sasa.',
      });
      return { match: baseMatch(msg, { toolsUsed: [...toolsUsed, 'getCurrentLocation'] }), action: 'share_location' };
    }

    case 'CHECK_LOCATION': {
      toolsUsed.push('getCurrentLocation');
      return { match: baseMatch(locationSentence(detectedLang)), action: 'none' };
    }

    case 'CHECK_HEALTH': {
      const bac = toolGetCurrentBAC();
      toolsUsed.push('getCurrentBAC');
      const bacVal = bac.ok && bac.data ? (bac.data as { bac: number }).bac : null;
      const healthText = pick(detectedLang, {
        en: bacVal !== null
          ? `Your latest reading shows a BAC of ${friendlyBac(bacVal)}. ${bacSentence(bacVal, detectedLang)}`
          : "I don't have your latest readings yet. Let me know if you'd like me to check again.",
        rw: bacVal !== null
          ? `Igipimo cyawe kigereranye n'ikindi kigaragaza BAC ya ${friendlyBac(bacVal)}.`
          : "Nta bipimo byawe bishya ngifite.",
        fr: bacVal !== null
          ? `Votre dernière mesure indique une alcoolémie de ${friendlyBac(bacVal)}.`
          : "Je n'ai pas encore vos dernières mesures.",
        sw: bacVal !== null
          ? `Kipimo chako cha mwisho kinaonyesha BAC ya ${friendlyBac(bacVal)}.`
          : 'Sina vipimo vyako vya mwisho bado.',
      });
      return { match: baseMatch(healthText, { requiresConfirmation: false }), action: 'none' };
    }

    case 'CHECK_HEART_RATE': {
      toolsUsed.push('getHeartbeat');
      return { match: baseMatch(heartbeatSentence(detectedLang)), action: 'none' };
    }

    case 'CHECK_SPO2': {
      toolsUsed.push('getSpO2');
      return { match: baseMatch(spo2Sentence(detectedLang)), action: 'none' };
    }

    case 'CHECK_TEMPERATURE': {
      toolsUsed.push('getTemperature');
      return { match: baseMatch(temperatureSentence(detectedLang)), action: 'none' };
    }

    case 'CHECK_DRIVING_READINESS': {
      toolsUsed.push('getDrivingReadiness', 'getCurrentBAC');
      return { match: baseMatch(drivingSentence(detectedLang)), action: 'none' };
    }

    case 'CHECK_ALCOHOL_STATUS': {
      const bac = toolGetCurrentBAC();
      toolsUsed.push('getCurrentBAC');
      const bacVal = bac.ok && bac.data ? (bac.data as { bac: number }).bac : null;
      return { match: baseMatch(bacSentence(bacVal, detectedLang)), action: 'none' };
    }

    case 'CHECK_REPORT': {
      const period = classification.period || 'daily';
      const toolName = period === 'daily' ? 'getDailyReport' : period === 'weekly' ? 'getWeeklyReport' : 'getMonthlyReport';
      toolsUsed.push(toolName);
      return { match: baseMatch(reportSentence(detectedLang, period)), action: 'none' };
    }

    case 'CHECK_ALERTS': {
      toolsUsed.push('getRecentAlerts');
      return { match: baseMatch(alertsSentence(detectedLang)), action: 'none' };
    }

    case 'CHECK_DEVICE_STATUS': {
      toolsUsed.push('getDeviceStatus');
      return { match: baseMatch(deviceSentence(detectedLang)), action: 'none' };
    }

    case 'SEARCH_WEB': {
      if (isAIConfigured()) {
        return { match: baseMatch(pick(detectedLang, {
          en: 'Let me run a web search for that.',
          rw: 'Reka ngushakire ku murusobe.',
          fr: 'Je lance une recherche web.',
          sw: 'Wacha nitafta mtandaoni.',
        }), { webSearchUsed: true }), action: 'none' };
      }
      return { match: baseMatch(webSearchUnavailableSentence(detectedLang), { webSearchUsed: false }), action: 'none' };
    }

    case 'HELP': {
      return { match: baseMatch(helpSentence(detectedLang)), action: 'none' };
    }

    case 'NORMAL_CONVERSATION': {
      const msg = pick(detectedLang, {
        en: 'I am here and listening. Ask me about your readings, your contacts, or your safety.',
        rw: 'Ndi hano njye numva. Mbaza kuri ibipimo byawe, contact zawe cyangwa umutekano wawe.',
        fr: "Je suis là et je vous écoute. Posez-moi des questions sur vos mesures, vos contacts ou votre sécurité.",
        sw: 'Niko hapa na kusikiliza. Niulize kuhusu vipimo vyako, mawasiliano yako au usalama wako.',
      });
      return { match: baseMatch(msg), action: 'none' };
    }

    case 'CLARIFICATION_REQUEST': {
      const msg = pick(detectedLang, {
        en: 'I need a bit more clarity before I do anything. Who should I call, or what would you like me to check?',
        rw: 'Nkeneye ibisobanuro mbere y’igihe cyose. Ninde ushaka ko nhamagara, cyangwa hari icyo ushaka ko mbuga?',
        fr: "J'ai besoin d'un peu plus de précision avant d'agir. Qui dois-je appeler, ou que voulez-vous que je vérifie ?",
        sw: 'Nahitaji maelezo zaidi kabla ya kufanya chochote. Nimpite nani, au unataka nicheki nini?',
      });
      return { match: baseMatch(msg, { requiresConfirmation: true, extractedEntity: { clarification: 'ambiguous request' } }), action: 'none' };
    }

    case 'UNKNOWN_COMMAND':
    default: {
      return { match: baseMatch(unknownSentence(detectedLang)), action: 'none' };
    }
  }
}

function classifyDeterministicLanguage(rawText: string, fallback: Language): Language {
  return detectLang(rawText.toLowerCase(), fallback);
}

/**
 * Truthful automated SoberWatch message (~10 seconds) that is NOT an
 * impersonation of the user.
 */
function buildAutomatedMessage(lang: Language, userUtterance: string): string {
  const base = pick(lang, {
    en: 'This is SoberWatch. The user has requested assistance and indicated that they are not feeling well. They may need help. Their current location can be shared if permission has been granted.',
    rw: 'Ndi SoberWatch. Ukoresha yasabye ubufasha kandi yagaragaje ko adakomeretse. Agomba kubona ubufasha. Uko ari hantu hashobora kubitsikana niba urenganzira rwatanzwe.',
    fr: "Voici SoberWatch. L'utilisateur a demandé de l'aide et a indiqué qu'il ne se sentait pas bien. Il peut avoir besoin d'aide. Sa position actuelle peut être partagée si l'autorisation a été accordée.",
    sw: 'Huyu ni SoberWatch. Mtumiaji ameomba msaada na ameonyesha kwamba hana hali nzuri. Anahitaji msaada. Eneo lake la sasa linaweza kushirikiwa kama ruhusa imetolewa.',
  });
  return base;
}

// ---------------------------------------------------------------------------
// LLM engine (Gemini) with real function calling
// ---------------------------------------------------------------------------

const LLM_MODEL = 'gemini-2.0-flash';

const SYSTEM_PROMPT = `
You are SoberWatch AI, a voice assistant for a personal alcohol-safety and health-monitoring app.

RULES:
- Be natural, concise and warm. Speak like a helpful assistant on a phone.
- NEVER diagnose a disease or prescribe medicine.
- NEVER infer a medical emergency from a single heartbeat reading alone.
- NEVER invent or assume sensor readings, contacts, phone numbers, or location. If a tool returns no data, say so honestly.
- You decide which SoberWatch data tools are relevant and call them. Never claim you checked data you did not call.
- If the user asks for a call, resolve the contact using getEmergencyContacts and then call the callContact function with the exact contact name. Do NOT invent a phone number - the app resolves the number safely.
- If the intent is ambiguous and the action is dangerous (calling, sharing location, triggering emergency), ask a clarifying question instead of acting.
- For health topics, describe differences from a baseline phrased as an observation ("Your heart rate is different from your recent baseline"), never as a diagnosis.
- Do not claim causation just because two values changed together.
- Use web search only when the question needs current external information (regulations, medicine, alcohol-and-driving guidance). For simple questions do not search.
- Keep responses short enough to be spoken aloud (1-3 sentences).
`.trim();

function functionDeclarations() {
  return [
    { name: 'getCurrentBAC', description: 'Get the user current blood alcohol concentration reading.', parameters: { type: 'OBJECT' as const, properties: {} } },
    { name: 'getBACHistory', description: 'Get recent BAC history summary (average, min, max, earliest, latest).', parameters: { type: 'OBJECT' as const, properties: {} } },
    { name: 'getHeartbeat', description: 'Get current heart rate plus recent trend, personal baseline (average), recent min/max and data quality.', parameters: { type: 'OBJECT' as const, properties: {} } },
    { name: 'getHeartRateHistory', description: 'Get heart rate history summary.', parameters: { type: 'OBJECT' as const, properties: {} } },
    { name: 'getSpO2', description: 'Get current blood oxygen (SpO2) reading.', parameters: { type: 'OBJECT' as const, properties: {} } },
    { name: 'getTemperature', description: 'Get current body temperature reading.', parameters: { type: 'OBJECT' as const, properties: {} } },
    { name: 'getDrivingReadiness', description: 'Get whether it is safe to drive based on the latest BAC and legal limits.', parameters: { type: 'OBJECT' as const, properties: {} } },
    { name: 'getDrivingContext', description: 'Get driving-relevant context (recent reading statuses, critical readings).', parameters: { type: 'OBJECT' as const, properties: {} } },
    { name: 'getCurrentLocation', description: "Check that a fresh GPS location can be acquired (share only if the user explicitly requests it or an emergency is triggered).", parameters: { type: 'OBJECT' as const, properties: {} } },
    { name: 'getEmergencyContacts', description: 'Get the names of the configured emergency contacts (numbers are resolved safely at call time).', parameters: { type: 'OBJECT' as const, properties: {} } },
    { name: 'getRecentAlerts', description: 'Get recent emergency events and the current reading status.', parameters: { type: 'OBJECT' as const, properties: {} } },
    { name: 'getDeviceStatus', description: 'Get the SoberWatch device status and time of the last reading.', parameters: { type: 'OBJECT' as const, properties: {} } },
    { name: 'getDailyReport', description: 'Get today report summary.', parameters: { type: 'OBJECT' as const, properties: {} } },
    { name: 'getWeeklyReport', description: 'Get last 7 days report summary.', parameters: { type: 'OBJECT' as const, properties: {} } },
    { name: 'getMonthlyReport', description: 'Get this month report summary.', parameters: { type: 'OBJECT' as const, properties: {} } },
    {
      name: 'callContact',
      description: 'Request to place a phone call to a configured emergency contact by name. The app resolves the number safely. Only call this after confirming the contact with getEmergencyContacts or from unambiguous user intent.',
      parameters: {
        type: 'OBJECT' as const,
        properties: {
          name: { type: 'string', description: 'Exact contact name (or role like "primary / emergency contact").' },
          message: { type: 'string', description: 'Optional ~10s automated SoberWatch assistance message to say after the call connects.' },
        },
        required: ['name'],
      },
    },
    {
      name: 'triggerEmergency',
      description: 'Trigger the SoberWatch emergency workflow (countdown then native call). Use only when the user clearly indicates an emergency or requests an emergency call.',
      parameters: { type: 'OBJECT' as const, properties: {} },
    },
    {
      name: 'shareLocation',
      description: 'Share the user current fresh GPS location with the emergency workflow. Only when explicitly requested.',
      parameters: { type: 'OBJECT' as const, properties: {} },
    },
  ];
}

let genInstance: Promise<unknown> | null = null;
function getGenAI() {
  // Lazy import to keep bundle split and avoid loading large lib when unused.
  if (genInstance) return genInstance;
  genInstance = import('@google/genai').then((m) => {
    const { GoogleGenAI } = m as { GoogleGenAI: new (opts: { apiKey: string }) => unknown };
    return new GoogleGenAI({ apiKey: geminiApiKey() });
  });
  return genInstance;
}

export async function runLlmTurn(
  rawText: string,
  contacts: EmergencyContact[],
  language: Language
): Promise<AgentTurnResult | null> {
  const key = geminiApiKey();
  if (!key) return null;
  try {
    const mod = await getGenAI();
    const ai = (mod as unknown as { models: unknown }).models;
    const generate = (ai as unknown as { generateContent: (opts: Record<string, unknown>) => Promise<{ text?: string; functionCalls?: Array<{ name: string; args?: Record<string, unknown> }>; candidates?: Array<{ content?: { parts?: Array<Record<string, unknown>> } }> }> }).generateContent.bind(ai);

    const contextWindow = conversationMemory.getContextWindow(language);
    const contactsList = contacts.map((c) => c.name).join(', ');

    const userMessage =
      `Current user request (speech transcription): "${rawText}"\n` +
      (contextWindow ? `Recent conversation:\n${contextWindow}\n` : '') +
      (contactsList ? `Configured contact names: ${contactsList}\n` : 'No contacts configured yet.\n') +
      `Language to respond in: ${language}. Respond in that language with the caller.`;

    const tools = [
      { functionDeclarations: functionDeclarations() },
      ...(isWebSearchConfigured() ? [{ googleSearch: {} as Record<string, unknown> }] : []),
    ];

    const opts: Record<string, unknown> = {
      model: LLM_MODEL,
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      systemInstruction: SYSTEM_PROMPT,
      tools,
      toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
      config: { temperature: 0.3 },
    };

    let response = await generate(opts);
    let action: AgentTurnResult['action'] = 'none';
    let actionTarget: AgentTurnResult['actionTarget'] | undefined;
    const toolsUsed: string[] = [];

    for (let round = 0; round < 4; round++) {
      const fcs = response.functionCalls;
      if (!fcs || fcs.length === 0) break;

      const parts: Array<Record<string, unknown>> = [];
      for (const fc of fcs) {
        const { name, args } = fc as { name: string; args?: Record<string, unknown> };
        toolsUsed.push(name);
        if (name === 'callContact') {
          const contactName = String(args?.name || '');
          const resolved = contactName ? resolveContact(contactName, { contacts }) : null;
          action = 'call';
          actionTarget = {
            name: resolved?.name || contactName,
            phone: resolved?.phone || undefined,
            message: typeof args?.message === 'string' ? args.message : undefined,
          };
          parts.push({ functionResponse: { name, response: { ok: true, note: 'Call requested; number resolution handled by the app.' } } });
        } else if (name === 'triggerEmergency') {
          action = 'emergency';
          parts.push({ functionResponse: { name, response: { ok: true, note: 'Emergency workflow requested.' } } });
        } else if (name === 'shareLocation') {
          action = 'share_location';
          parts.push({ functionResponse: { name, response: { ok: true, note: 'Location share requested.' } } });
        } else {
          const result = executeAgentTool(name);
          parts.push({ functionResponse: { name, response: { ok: result.ok, data: result.data ?? null, error: result.error ?? null } } });
        }
      }

      const priorContent = response.candidates?.[0]?.content;
      const nextContents = [
        { role: 'user', parts: [{ text: userMessage }] },
        ...(priorContent ? [{ role: 'model', parts: priorContent.parts }] : []),
        { role: 'user', parts },
      ];
      response = await generate({ ...opts, contents: nextContents } as Record<string, unknown>);
    }

    const text = response.text?.trim() || '';
    if (!text) return null;

    const intent = actionFromAction(action);
    const detectedLang = classifyDeterministicLanguage(rawText, language);
    const entity: VoiceIntentEntity | undefined = actionTarget
      ? { contactName: actionTarget.name, contactPhone: actionTarget.phone, message: actionTarget.message }
      : undefined;

    const match: VoiceIntentMatch = {
      intent,
      confidence: 0.9,
      rawText,
      normalizedText: normalizeVoiceText(rawText),
      detectedLanguage: detectedLang,
      extractedEntity: entity,
      speechResponse: text,
      toolsUsed,
      webSearchUsed: isWebSearchConfigured(),
    };

    return { match, action, actionTarget };
  } catch (err) {
    // Network/model errors fall back to deterministic reasoning (which uses
    // local tools) so the assistant keeps working offline.
    console.warn('[AI] LLM turn failed, using local reasoning:', err);
    return runDeterministicTurn(rawText, language, contacts);
  }
}

function actionFromAction(action: AgentTurnResult['action']): VoiceIntent {
  switch (action) {
    case 'call': return 'CALL_CONTACT';
    case 'emergency': return 'EMERGENCY_REQUEST';
    case 'share_location': return 'SHARE_LOCATION';
    case 'cancel_emergency': return 'CANCEL_EMERGENCY';
    case 'end_call': return 'STOP_CALL';
    default: return 'GENERAL_QUESTION';
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function processAgentTurn(
  rawText: string,
  language: Language,
  contacts: EmergencyContact[]
): Promise<AgentTurnResult> {
  const result = await runLlmTurn(rawText, contacts, language).then((llm) => llm || runDeterministicTurn(rawText, language, contacts));
  conversationMemory.addUserTurn(rawText.trim(), result.match.intent, result.match.toolsUsed);
  conversationMemory.addAssistantTurn(result.match.speechResponse, result.match.toolsUsed);
  return result;
}