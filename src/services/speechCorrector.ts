import { EmergencyContact } from '../types';

/**
 * Speech correction and semantic cleanup for the voice agent.
 *
 * Android speech recognition / user self-correction produce mistakes such as:
 *   - "Call Jam... James... no, John."          -> corrected target: John
 *   - "call my emergency con tact"              -> "call my emergency contact"
 *   - "hamagara ma..."                          -> partial name
 *
 * We apply:
 *   1. Correction markers ("no, X", "I meant X", "nego X", "... no X ...").
 *   2. A small, high-precision phrase correction map for transcription errors
 *      (only applied when the surrounding context makes it highly likely).
 *   3. Partial-name resolution against configured contacts (only the last,
 *      "corrected" name candidate is used for contact resolution).
 *
 * Safety rule: never silently reinterpret a dangerous command when confidence
 * is low. Partial/resolved names return low confidence which the caller must
 * treat as "ask for clarification" for call/emergency actions.
 */

export interface CorrectionResult {
  /** Text after applying known corrections. */
  correctedText: string;
  /** The most likely corrected contact name extracted from the utterance, if any. */
  correctedName?: string;
  /** True when a user self-correction marker was found. */
  hadCorrection: boolean;
  /** Confidence in the applied corrections. */
  confidence: number;
}

// Transcription-error -> intended phrase. Keys are lowercased, normalized.
// Only map to phrases that are highly unlikely to be intended literally given
// the app's domain ("contact", "emergency", "call", "heart", "drive").
const PHRASE_CORRECTIONS: Array<{ match: RegExp; replace: string; note: string }> = [
  { match: /emergenc(?:y)?\s+y|emergency\s+y|emergen cy|emirgen cy/g, replace: 'emergency', note: 'emergency' },
  { match: /emergency\s+con\s*tact|con\s*tact\s+d\s+urgence/g, replace: 'emergency contact', note: 'emergency contact' },
  { match: /con\s*tact/g, replace: 'contact', note: 'contact' },
  { match: /he(?:a|e)rt\s+ra(?:t|d)e|hert\s+rate|heart\s+rad/g, replace: 'heart rate', note: 'heart rate' },
  { match: /driv(?:ing|e)\s+rea(?:d|t)iness/g, replace: 'driving readiness', note: 'driving readiness' },
];

const CORRECTION_MARKERS: Array<{ pattern: RegExp; group: number }> = [
  // "no, John", "no John", "no... John"
  { pattern: /\bno\s*,?\s+([a-z][a-z -]{1,30})/gi, group: 1 },
  // "I meant James", "I mean John"
  { pattern: /\bi(\s+am)?\s+meant?\s+([a-z][a-z -]{1,30})/gi, group: 2 },
  // Kinyarwanda: "Oya, John" / "Nganye kuri John"
  { pattern: /\boya\s*,?\s+([a-z][a-z -]{1,30})/gi, group: 1 },
  { pattern: /\bnganye kuri\s+([a-z][a-z -]{1,30})/gi, group: 1 },
  // French: "non, Jean" / Swahili: "hapana, John"
  { pattern: /\bnon\s*,?\s+([a-z][a-z -]{1,30})/gi, group: 1 },
  { pattern: /\bhapana\s*,?\s+([a-z][a-z -]{1,30})/gi, group: 1 },
  // "actually John", "not James, John"
  { pattern: /\bactually\s+([a-z][a-z -]{1,30})/gi, group: 1 },
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, ' ')
    .replace(/[^a-z0-9 -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Highest-scoring contact match from a fuzzy name fragment against the
 * configured contact list. Returns confidence 0 if there is no strong match.
 */
export function matchContactFragment(
  text: string,
  contacts: EmergencyContact[]
): { name: string; phone: string; confidence: number } | null {
  const norm = normalize(text);
  if (!norm || contacts.length === 0) return null;

  // Direct or normalized exact match.
  for (const contact of contacts) {
    const nameNorm = normalize(contact.name);
    if (nameNorm === norm) return { name: contact.name, phone: contact.phone, confidence: 0.98 };
  }

  // Relationship/nickname slots.
  const relationshipSlots: Array<{ keys: string[]; resolver: (c: EmergencyContact) => boolean }> = [
    { keys: ['mama', 'mom', 'mummy', 'mother', 'maman', 'mama yanjye'], resolver: (c) => /mama|mom|mother|maman/i.test(`${c.name} ${c.relationship || ''}`) || c.name.toLowerCase().includes('mama') },
    { keys: ['papa', 'dad', 'daddy', 'father', 'pere', 'papa yanjye'], resolver: (c) => /papa|dad|father|pere/i.test(`${c.name} ${c.relationship || ''}`) },
    { keys: ['uwungu', 'wife', 'umugore', 'femme', 'mkewe'], resolver: (c) => /wife|umugore|femme|mkewe/i.test(`${c.name} ${c.relationship || ''}`) },
    { keys: ['husband', 'umugabo', 'mari', 'mume'], resolver: (c) => /husband|umugabo|mari|mume/i.test(`${c.name} ${c.relationship || ''}`) },
    { keys: ['boss', 'umuyobozi', 'manager', 'directeur'], resolver: (c) => /boss|manager|umuyobozi|directeur/i.test(`${c.name} ${c.relationship || ''}`) },
    { keys: ['doctor', 'umuganga', 'medecin', 'daktari'], resolver: (c) => /doctor|doc|umuganga|medecin|daktari/i.test(`${c.name} ${c.relationship || ''}`) },
    { keys: ['brother', 'umuvandimwe', 'frere', 'kaka', 'ndugu'], resolver: (c) => /brother|frere|kaka|ndugu|umuvandimwe/i.test(`${c.name} ${c.relationship || ''}`) },
    { keys: ['sister', 'umushiki', 'soeur', 'dada'], resolver: (c) => /sister|soeur|dada|umushiki/i.test(`${c.name} ${c.relationship || ''}`) },
  ];

  for (const slot of relationshipSlots) {
    for (const key of slot.keys) {
      if (norm.includes(key)) {
        const match = contacts.find(slot.resolver);
        if (match) return { name: match.name, phone: match.phone, confidence: 0.92 };
      }
    }
  }

  // "emergency contact", "primary contact", "secondary/backup" slots.
  if (/\bemergen?c?y\s+contact\b|\bcontact\s+d\s*urgence\b|\bcontact\s+ya\s+dharura\b|\burgent\s+contact\b/.test(norm)) {
    const primary = contacts.find((c) => c.isPrimary) || contacts[0];
    if (primary) return { name: primary.name, phone: primary.phone, confidence: 0.9 };
  }
  if (/\b(first|primary|ya mbere|ya kabiri|main|principal|contact yanjye|mon contact)\b/.test(norm)) {
    const primary = contacts.find((c) => c.isPrimary) || contacts[0];
    if (primary) return { name: primary.name, phone: primary.phone, confidence: 0.88 };
  }
  if (/\b(secondary|backup|second|ya kabiri|msaidizi wa pili|contact of emergency)\b/.test(norm)) {
    const secondary = contacts.find((c) => c.isSecondary) || (contacts.length > 1 ? contacts[1] : contacts[0]);
    if (secondary) return { name: secondary.name, phone: secondary.phone, confidence: 0.88 };
  }

  // Fuzzy partial matches (prefix >= 3 chars, or small edit distance).
  const tokens = norm.split(/[ ]+/).filter((t) => t.length >= 3);
  let best: { name: string; phone: string; confidence: number } | null = null;
  for (const token of tokens) {
    for (const contact of contacts) {
      const nameTokens = normalize(contact.name).split(/[ ]+/);
      for (const nameToken of nameTokens) {
        if (nameToken.length < 3) continue;
        if (nameToken.startsWith(token) || token.startsWith(nameToken)) {
          // Exact token equality = unambiguous name match (\"John\" -> John Mugisha).
          // Prefix matches stay well below the 0.8 action threshold so ambiguous
          // partial names (\"ali\" -> Alice?) still require confirmation.
          let conf: number;
          if (nameToken === token) {
            conf = 0.95;
          } else {
            conf = Math.max(0.6, Math.min(0.75, 0.5 + (Math.min(nameToken.length, token.length) / 20)));
          }
          if (!best || conf > best.confidence) {
            best = { name: contact.name, phone: contact.phone, confidence: conf };
          }
        }
      }
    }
  }

  // Levenshtein <= 2 for names.
  if (tokens.length === 1 && !best) {
    for (const contact of contacts) {
      const nameNorm = normalize(contact.name);
      const dist = levenshtein(tokens[0], nameNorm);
      if (dist <= 2) {
        const conf = 0.72;
        if (!best || conf > best.confidence) best = { name: contact.name, phone: contact.phone, confidence: conf };
      }
    }
  }

  return best;
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

/**
 * Clean a raw transcript and extract any self-correction.
 */
export function correctSpeech(rawText: string, contacts: EmergencyContact[] = []): CorrectionResult {
  if (!rawText) return { correctedText: '', hadCorrection: false, confidence: 1 };

  let text = rawText.replace(/\s+/g, ' ').trim();
  let hadCorrection = false;
  let correctedName: string | undefined;
  let confidence = 1;

  // 1. Detect self-correction markers. NOTE: String.match() with the /g flag
  // returns only full matches (no capture groups), so we run the marker with
  // its global flag stripped to still read the captured "corrected name".
  for (const marker of CORRECTION_MARKERS) {
    const flags = marker.pattern.flags.replace(/g/gi, '');
    const match = text.match(new RegExp(marker.pattern.source, flags));
    if (match && match[marker.group]) {
      const candidate = match[marker.group].trim().replace(/[.!,;]/g, '');
      if (candidate.length > 1) {
        hadCorrection = true;
        correctedName = candidate;
        confidence = Math.min(confidence, 0.85);
      }
    }
  }

  // 2. Apply high-precision phrase corrections.
  let anyPhraseCorrected = false;
  let phraseConfidence = 1;
  for (const entry of PHRASE_CORRECTIONS) {
    const prev = text;
    text = text.replace(entry.match, entry.replace);
    if (text !== prev) {
      anyPhraseCorrected = true;
      phraseConfidence = Math.min(phraseConfidence, 0.95);
    }
  }
  if (anyPhraseCorrected) confidence = Math.min(confidence, phraseConfidence);

  // 3. If a correction marker named someone, keep the corrected name but strip
  //    the self-correction filler so intent matching sees the final target.
  if (correctedName) {
    // "Call James no John" -> keep "John" as the resolved target.
    text = text.replace(/^(.*?)(?:\b(?:no|oya|non|hapana|i\s+meant?|nganye\s+kuri|actually)\b[^,.]*)$/i, '$1')
      .replace(/\b(?:no|oya|non|hapana|i\s+meant|nganye kuri|actually)\s*,?\s*[a-z][a-z -]{1,30}$/i, '');
  }

  return {
    correctedText: text.replace(/\s+/g, ' ').trim(),
    correctedName,
    hadCorrection,
    confidence,
  };
}

/**
 * Best-effort extraction of a contact name from text (used by deterministic
 * fallback when no LLM is configured).
 */
export function extractLikelyContactName(text: string, contacts: EmergencyContact[]): { name: string; phone: string; confidence: number } | null {
  const correction = correctSpeech(text, contacts);
  if (correction.correctedName) {
    const match = matchContactFragment(correction.correctedName, contacts);
    if (match) return match;
  }
  return matchContactFragment(text, contacts);
}