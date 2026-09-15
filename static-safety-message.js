/**
 * SoberWatch static safety messages (backend JS port).
 *
 * Single source of truth (server-side) for the FULL personalized SoberWatch
 * safety message that must be served when the OpenRouter-backed AI route is
 * unavailable (offline, network error, backend failure, invalid AI response,
 * etc.). Mirrors `soberwatch_newversion/src/services/staticSafetyMessages.ts`.
 *
 * It ALWAYS bases the advice on the actual sensor reading passed in (BAC,
 * status, heart rate, SpO2, temperature) and never invents, estimates, or
 * assumes a measurement.
 */

/**
 * Returns the numeric value only when it is a real, finite number; otherwise
 * null so callers never fabricate a reading.
 */
function measuredValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeLang(language) {
  return language === "rw" || language === "fr" || language === "sw" || language === "en" ? language : "en";
}

function closingLine(lang) {
  if (lang === "rw") return "SoberWatch — Umutekano mbere. Ubuzima mbere.";
  if (lang === "fr") return "SoberWatch — La sécurité avant tout. La santé avant tout.";
  if (lang === "sw") return "SoberWatch — Usalama kwanza. Afya kwanza.";
  return "SoberWatch — Safety first. Health first.";
}

/**
 * SAFE       — no detected alcohol (BAC = 0.00).
 * CAUTION    — low positive alcohol measurement (0.02 <= BAC < 0.08).
 * DANGER     — high alcohol measurement (BAC >= 0.08 or status DANGER).
 * EMERGENCY  — extremely high / critical (BAC >= 0.14, or DANGER status with
 *              BAC >= 0.10).
 */
function determineSafetyLevel(reading) {
  const status = reading?.status || "SAFE";
  const bac = measuredValue(reading?.alcoholBac);
  if (bac !== null && (bac >= 0.14 || (status === "DANGER" && bac >= 0.1))) return "EMERGENCY";
  if (status === "DANGER" || (bac !== null && bac >= 0.08)) return "DANGER";
  if (status === "CAUTION" || (bac !== null && bac >= 0.02)) return "CAUTION";
  return "SAFE";
}

function safetyLevelToPriority(level) {
  switch (level) {
    case "EMERGENCY": return "CRITICAL";
    case "DANGER": return "HIGH";
    case "CAUTION": return "MEDIUM";
    default: return "LOW";
  }
}

function staticSafetyTitle(lang) {
  if (lang === "rw" || lang === "sw" || lang === "en") return "SoberWatch AI";
  return "SoberWatch IA";
}

/**
 * Builds the full personalized safety message from the ACTUAL sensor reading.
 *
 * Rules honoured:
 *  - the advice is always explained as being based on the real SoberWatch
 *    measurement;
 *  - the device never medically certifies the user as safe to drive;
 *  - DANGER guidance follows the Rwanda National Police road-safety guidance;
 *  - EMERGENCY never claims a call/notification/human intervention happened;
 *  - if the measurement is unavailable we say so honestly instead of guessing.
 */
function buildPersonalizedSafetyMessage(language, reading) {
  const lang = normalizeLang(language);
  const bac = measuredValue(reading?.alcoholBac);
  const status = reading?.status || "SAFE";
  const hr = measuredValue(reading?.heartRateBpm);
  const spo2 = measuredValue(reading?.spo2Percent);
  const temp = measuredValue(reading?.tempCelsius);
  const closing = closingLine(lang);

  // ---------------------------------------------------------------------
  // 1) Measurement unavailable → never guess; advise re-measurement.
  // ---------------------------------------------------------------------
  if (!reading || bac === null) {
    if (lang === "rw") return `Urakoze gukoresha SoberWatch. Igipimo cy’inzoga nticyashobora kugaragazwa neza. Aya masezerano y’ubuzima akomotse ku bipimo by’ukuri byakiriwe na SoberWatch. Reba ko sensor ikora neza, uhangane n’igihe cy’igipimo gishya kiboneka, kandi wibuke ko ubuzima n’umutekano byagombye kubanza. ${closing}`;
    if (lang === "fr") return `Merci d’utiliser SoberWatch. La mesure d’alcool n’a pas pu être confirmée. Ce conseil de sécurité est basé uniquement sur les données effectivement reçues par SoberWatch. Vérifiez le capteur, puis refaites une mesure dès qu’un nouveau résultat est disponible. ${closing}`;
    if (lang === "sw") return `Asante kutumia SoberWatch. Kiwango cha pombe hakiwezi kuthibitishwa kwa sasa. Ushauri huu unaegemezwa na data halisi iliyopokelewa na SoberWatch. Angalia kifaa na upime tena ukitokea kipimo kipya. ${closing}`;
    return `Thank you for using SoberWatch. The alcohol measurement could not be confirmed. This safety advice is based only on data actually received from SoberWatch. Please check the sensor, then re-measure as soon as a fresh reading is available. ${closing}`;
  }

  const bacText = bac.toFixed(3);
  const hrText = hr !== null ? `${Math.round(hr)} BPM` : "not provided";
  const spo2Text = spo2 !== null ? `${Math.round(spo2)}%` : "not provided";
  const tempText = temp !== null ? `${temp.toFixed(1)}°C` : "not provided";

  const prevention = lang === "rw"
    ? "Komeza kwitwararika, ukurikiranire ibipimo bya SoberWatch, kandi ntugire uruhare rwinshi mu muhanda utari umutekano."
    : lang === "fr"
      ? "Continuez à rester vigilant, surveillez vos mesures SoberWatch et évitez toute conduite qui ne serait pas sûre."
      : lang === "sw"
        ? "Endelea kuwa makini, fuatilia vipimo vyako vya SoberWatch, na epuka kuendesha ikiwa hali ni hatari."
        : "Continue to stay alert, monitor your SoberWatch readings, and avoid any driving that is not clearly safe.";

  switch (determineSafetyLevel(reading)) {
// 4) EMERGENCY — extremely high / critical measurement.
    case "EMERGENCY": {
      if (lang === "rw") return `Urakoze gukoresha SoberWatch. Igipimo cy’inzoga cyagaragaye ${bacText}, kandi iki ni ikipimo cy’ukuri cyakiriwe na SoberWatch cyerekana ko kibazo gikomera cy’umutekano. Aya masezerano y’umutekano akomotse ku bipimo by’ukuri, kandi asaba ko ntugatware, hagarara ahantu hizewe, kandi ntugire uri wiza niba uri mu kibazo gikomeye. Niba uri mu kibazo gikomeye, hamagara ubufasha bw’ubutabazi cyangwa umuntu uri mu mutekano imbere. SoberWatch ntangwa kuziga ko hamagara, ibimenyetsa, cyangwa abantu byarimo; ugwe uri rinda akibazo. Umutekano wawe n’ubuzima bwawe butagomba kuregwa kuruta urugendo. Uko meze ni ${hrText}, SpO2 ${spo2Text}, ubushyuhe ${tempText}. ${prevention} ${closing}`;
      if (lang === "fr") return `Merci d’utiliser SoberWatch. La mesure d’alcool détectée est ${bacText}, une donnée réellement reçue par SoberWatch d’un niveau critique. Ce conseil de sécurité est fondé sur cette mesure réelle et doit primer avant toute chose. Ne conduisez pas, ne restez pas seul si vous êtes gravement intoxiqué, et si vous présentez des symptômes sérieux — comme une difficulté à respirer ou une perte de connaissance — appelez immédiatement les secours médicaux. SoberWatch ne peut pas confirmer qu’un appel, une notification ou une intervention humaine a eu lieu; vous devez agir vous-même immédiatement. Votre santé et la sécurité de tous sur la route passent avant tout trajet. Fréquence cardiaque: ${hrText}; SpO₂: ${spo2Text}; température: ${tempText}. ${prevention} ${closing}`;
      if (lang === "sw") return `Asante kutumia SoberWatch. Kiwango cha pombe kilichotambuliwa ni ${bacText}, kipimo halisi kilichopokelewa na SoberWatch kilichonaonyesha hatari kubwa kabisa ya dharura. Ushauri huu unaegemezwa na data halisi ya SoberWatch na uhima mbere kuliko. Usiendele kuendesha, usifaraki kuhisi weka ukihisi kuharibika kabisa, na ukiona unaweza kupumzi au ukiona unaweza kuguma, piga msaada ya dharura ya moto sasa. SoberWatch hakwezi kutengeneha kwamba simu, izibizi, au msaada ya kutokombea imepiga; uwezo lako kunaweza kufuta hivi sasa. Usalama wako na afya yako ni jambo kubwa kuliko safari. Mapigo ya moyo: ${hrText}, SpO₂: ${spo2Text}, joto: ${tempText}. ${prevention} ${closing}`;
      return `Thank you for using SoberWatch. The alcohol measurement detected is ${bacText}, a critically concerning reading received from the SoberWatch sensor. This safety advice is based on that real measurement, and it must come before everything else. Do not drive, do not remain alone if you are severely impaired, and if you have serious symptoms — such as difficulty breathing or losing consciousness — call emergency medical services right now. SoberWatch cannot confirm that a call, a notification, or a human response has happened; you must take action yourself immediately. Your health and the safety of everyone on the road matter more than any trip. Heart rate: ${hrText}; SpO₂: ${spo2Text}; temperature: ${tempText}. ${prevention} ${closing}`;
}

    // 3) DANGER — high alcohol measurement.
    //    Guidance aligned with the Rwanda National Police road safety.
    case "DANGER": {
      if (lang === "rw") return `Urakoze gukoresha SoberWatch. Igipimo cy’inzoga cyagaragaye ${bacText}. Iki ni ikipimo cy’ukuri cyakiriwe na SoberWatch, kandi cyerekana akaga gakomeye ku mutekano w’umuhanda. Aya masezerano y’umutekano akomotse ku bipimo by’ukuri, akaba ari amahugurwa y’ibanze ya Polisi y’u Rwanda n’itsinda ry’umutekano: ntugatware, utorore umugenzi utanyoye, cyangwa usabe ubufasha bwa hafi. Alcohol ishobora guhindura ubushishozi, ubuhanga bwo gutekereza, umuvuduko, no guhuza ibitekerezo. Ibi byangiza imitekerereze ndetse no kugenzura by’umuhanda. Ntukomeze urugendo; jya ahantu hizewe, humura, kandi ukomeze gukurikiranira ibimenyetso bya SoberWatch. Uko meze ni ${hrText}, SpO2 ${spo2Text}, ubushyuhe ${tempText}. ${prevention} ${closing}`;
      if (lang === "fr") return `Merci d’utiliser SoberWatch. La mesure d’alcool détectée est ${bacText}. Il s’agit d’une donnée réelle reçue par SoberWatch, et elle indique un niveau élevé et dangereux pour la conduite. Ce conseil de sécurité est fondé sur la mesure réelle et s’aligne avec les recommandations de sécurité routière de la Police Nationale du Rwanda: ne conduisez pas, laissez le volant à une personne sobre ou utilisez un moyen de transport sûr. L’alcool altère le jugement, la coordination, les réflexes et la sécurité de la route. Ne continuez pas votre trajet; trouvez un endroit sûr, reposez-vous et demandez de l’aide si nécessaire. Fréquence cardiaque: ${hrText}; SpO₂: ${spo2Text}; température: ${tempText}. ${prevention} ${closing}`;
      if (lang === "sw") return `Asante kutumia SoberWatch. Kiwango cha pombe kilichotambuliwa ni ${bacText}. Hiki ni kipimo halisi kilichopokelewa na SoberWatch, na kinaonyesha kiwango kikubwa cha hatari kwa usalama wa barabara. Ushauri huu unategemea data halisi ya SoberWatch na unakubaliana na mwongozo wa usalama barabarani wa Polisi ya Rwanda: usiendele kuendesha, acha gari kwa dereva asiye na pombe au utumie usafiri salama. Pombe inaweza kuathiri uamuzi, uratibu, majibu ya haraka, na usalama wa barabara. Usisukue safari yako; pata sehemu salama, pumzika, na uombe usaidizi ukihitajika. Mapigo ya moyo: ${hrText}, SpO₂: ${spo2Text}, joto: ${tempText}. ${prevention} ${closing}`;
      return `Thank you for using SoberWatch. The alcohol level recorded is ${bacText}. This is a real reading received by SoberWatch and it indicates a high-risk level for safe driving. This safety advice is based on the actual measurement and follows the road-safety guidance of the Rwanda National Police: do not drive, hand the vehicle to a sober driver, or use a safe ride. Alcohol can impair judgment, coordination, reaction time, and road safety. Do not continue the journey; find a safe place, rest, and seek help if needed. Heart rate: ${hrText}; SpO₂: ${spo2Text}; temperature: ${tempText}. ${prevention} ${closing}`;
    }
// 2) CAUTION — low positive alcohol measurement.
    case "CAUTION": {
      if (lang === "rw") return `Urakoze gukoresha SoberWatch. Igipimo cy’inzoga cyagaragaye ${bacText}. Ibi ni ibipimo by’ukuri byakiriwe na SoberWatch, kandi byerekana ko haracyariho ingaruka z’inyonga. Aya masezerano y’umutekano ashingiye ku gipimo cy’ukuri, kandi asaba ko utarategura urugendo. Ntugatware imodoka, shakisha umushoferi utanyoye, cyangwa ukore icyemezo cy’umutekano gihita. Kuriwe, kumva umeze neza si byiza byerekana ko gutwara birashoboka. Wibuke ko ubuzima bwawe n’ubw’abandi koresha umuhanda ari by’ingenzi biruta kuzamura urugendo. Uko meze ni ${hrText}, SpO2 ${spo2Text}, ubushyuhe ${tempText}. ${prevention} ${closing}`;
      if (lang === "fr") return `Merci d’utiliser SoberWatch. La mesure d’alcool détectée est ${bacText}. C’est une donnée réelle reçue par SoberWatch et elle indique une présence d’alcool qui nécessite une grande prudence. Ce conseil de sécurité est fondé sur cette mesure précise et recommande de ne pas conduire. N’utilisez pas le véhicule, attendez, demandez une escorte sobre ou choisissez un transport sûr. Il ne suffit pas de se sentir normal pour conclure que la conduite est sans danger. La sécurité de votre vie et celle des autres usagers doit passer avant votre trajet. Fréquence cardiaque: ${hrText}; SpO₂: ${spo2Text}; température: ${tempText}. ${prevention} ${closing}`;
      if (lang === "sw") return `Asante kutumia SoberWatch. Kiwango cha pombe kilichotambuliwa ni ${bacText}. Hiki ni kipimo halisi kilichopokelewa na SoberWatch, na kinaonyesha kiwango cha pombe kinachohitaji makini makubwa. Ushauri huu unategemea data halisi na unashauri usiendele kuendesha. Usitume gari, subiri, omba dereva aliye na pombe au utumie usafiri salama. Kujisikia vizuri si uhakika kwamba kuendesha ni salama. Usalama wako na wa wengine barabarani ni muhimu kuliko safari. Mapigo ya moyo: ${hrText}, SpO₂: ${spo2Text}, joto: ${tempText}. ${prevention} ${closing}`;
      return `Thank you for using SoberWatch. The measured alcohol level is ${bacText}. This is a real reading received by SoberWatch and it indicates an alcohol level that requires caution. This safety advice is based on the actual measured data and recommends that you do not drive. Do not use the vehicle, wait, call a sober driver, or use a safe ride. Feeling okay is not enough to confirm that driving is safe. Your safety and the safety of others on the road must come before the trip. Heart rate: ${hrText}; SpO₂: ${spo2Text}; temperature: ${tempText}. ${prevention} ${closing}`;
    }
// 1) SAFE — no detected alcohol.
    default: {
      if (lang === "rw") return `Urakoze gukoresha SoberWatch. Igipimo cy’inzoga cyagaragaye ${bacText}. Ibi ni ibipimo by’ukuri byakiriwe na SoberWatch, kandi bikagaragaza ko nta nkomatose y’inkari y’inyongera yagaragaye. Aya masezerano ni amahugurwa y’umutekano akomotse ku mashusho ya SoberWatch, kandi ntanga uburenganzira bwo gutwara nta kibazo. Komeza kwitondera amategeko y’umuhanda, wubake ibikorwa by’umutekano, kandi ukomeze koko kurinda ubuzima bwawe n’ubw’abandi. Ubuhumekero bwawe ni ${hrText}, SpO2 ${spo2Text}, ubushyuhe ${tempText}. ${prevention} ${closing}`;
      if (lang === "fr") return `Merci d’utiliser SoberWatch. La mesure d’alcool détectée est ${bacText}. C’est une mesure réelle reçue par SoberWatch, et elle montre qu’aucune quantité d’alcool significative n’a été détectée. Ce conseil de sécurité est fondé sur cette donnée mesurée et ne constitue pas une autorisation médicale pour conduire. Continuez à respecter les règles de sécurité routière, évitez toute conduite risquée et restez attentif à votre état et à celui des autres usagers. Fréquence cardiaque: ${hrText}; SpO₂: ${spo2Text}; température: ${tempText}. ${prevention} ${closing}`;
      if (lang === "sw") return `Asante kutumia SoberWatch. Kiwango cha pombe kilichotambuliwa ni ${bacText}. Hiki ni kipimo halisi kilichopokelewa na SoberWatch, na kinaonyesha hakuna kiwango kikubwa cha pombe kilichotambuliwa. Ushauri huu ni mwongozo wa usalama unaotokana na data halisi, si kibali cha matibabu cha kuendesha. Endelea kufuata sheria za usalama barabarani, epuka kuendesha kwa makusudi, na kaza makini kuhusu afya yako na ya wengine. Mapigo ya moyo: ${hrText}, SpO₂: ${spo2Text}, joto: ${tempText}. ${prevention} ${closing}`;
      return `Thank you for using SoberWatch. The alcohol measurement recorded is ${bacText}. This is a real reading received by SoberWatch and it shows no significant alcohol level. This advice is based on the actual measured data rather than assumption, and it is not medical clearance to drive. Please continue to follow road-safety rules, avoid risky driving, and remain alert to your condition and the safety of others. Heart rate: ${hrText}; SpO₂: ${spo2Text}; temperature: ${tempText}. ${prevention} ${closing}`;
    }
  }
}

/**
 * FULL static safety insight served when OpenRouter is unavailable.
 * A small, loyal-level insight object shaped like the backend's AI insight
 * response so the client keeps rendering the full personalized message.
 */
function buildStaticSafetyInsight(language, currentReading) {
  const lang = normalizeLang(language);
  const level = determineSafetyLevel(currentReading);
  const reading = currentReading || null;
  return {
    type: level === "SAFE" ? "general" : "safety",
    priority: safetyLevelToPriority(level),
    title: staticSafetyTitle(lang),
    message: buildPersonalizedSafetyMessage(language, reading),
    reason: "Backend AI (OpenRouter) unavailable — showing SoberWatch static safety guidance based on the actual reading",
    recommendedAction: null,
    relatedData: reading ? ["alcoholBac", "heartRateBpm", "spo2Percent", "tempCelsius"] : [],
    timestamp: Date.now(),
    source: "static",
  };
}

module.exports = {
  closingLine,
  measuredValue,
  determineSafetyLevel,
  safetyLevelToPriority,
  buildPersonalizedSafetyMessage,
  buildStaticSafetyInsight,
};