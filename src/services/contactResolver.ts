import { EmergencyContact } from '../types';
import { correctSpeech, matchContactFragment } from './speechCorrector';

/**
 * Contact resolution for the voice agent.
 *
 * Returns a resolved contact (name + phone) OR a clarification request.
 * - Never invents a phone number.
 * - Never calls an arbitrary number from an uncertain speech result: if the
 *   caller is performing a dangerous action (call / emergency) and confidence is
 *   below the safety threshold, this returns `requiresConfirmation: true` with
 *   the best candidate so the pipeline can ask for confirmation.
 */

export interface ResolvedContact {
  name: string;
  phone: string;
  confidence: number;
  requiresConfirmation: boolean;
  clarifications: string[];
}

export interface ContactResolutionContext {
  contacts: EmergencyContact[];
  lastMentionedContact?: EmergencyContact | null;
}

const DANGEROUS_ACTION_CONFIDENCE_THRESHOLD = 0.8;

/**
 * Resolve whom the user wants to call from natural speech.
 */
export function resolveContact(
  rawText: string,
  context: ContactResolutionContext
): ResolvedContact | null {
  const contacts = context.contacts || [];
  const text = rawText.replace(/\s+/g, ' ').trim();
  const norm = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (!text) return null;

  // Slot references: "emergency contact", "primary", "my contact", "backup".
  const slot = resolveSlotReference(norm, contacts);
  if (slot) return slot;

  // Pronouns referring to the last mentioned contact: "call her/him/them".
  if (/\b(?:him|her|them)\b/.test(norm)) {
    if (context.lastMentionedContact?.phone) {
      return {
        name: context.lastMentionedContact.name,
        phone: context.lastMentionedContact.phone,
        confidence: 0.9,
        requiresConfirmation: false,
        clarifications: [],
      };
    }
  }

  // Name matching with corrections ("no, John", "I meant James").
  const match = matchContactFragmentForResolve(text, contacts);

  if (!match) {
    // If the user explicitly asked to call someone ("call X") but we cannot
    // resolve X to a configured contact, do NOT invent a number -> ask.
    if (/\b(?:call|hamagara|mpamagarira|appeler|piga\s*simu)\b/.test(norm)) {
      const mentionsAnyName = matchContactFragmentForResolve(text, contacts, true);
      if (!mentionsAnyName) return null;
    }
    return null;
  }

  const isDangerous = /\b(?:call|hamagara|mpamagarira|appeler|piga\s*simu)\b/.test(norm);
  const safe = !isDangerous || match.confidence >= DANGEROUS_ACTION_CONFIDENCE_THRESHOLD;

  return {
    name: match.name,
    phone: match.phone,
    confidence: match.confidence,
    requiresConfirmation: !safe,
    clarifications: !safe
      ? [`I found ${match.name} (${match.phone}). Did you mean this contact?`]
      : [],
  };
}

function matchContactFragmentForResolve(
  text: string,
  contacts: EmergencyContact[],
  lenient = false
): { name: string; phone: string; confidence: number } | null {
  const correction = correctSpeech(text, contacts);
  if (correction.correctedName) {
    const match = matchContactFragment(correction.correctedName, contacts);
    if (match) return match;
  }
  const match = matchContactFragment(text, contacts);
  if (match) return match;
  if (!lenient) return null;

  // Lenient: any contact whose first name appears anywhere in the utterance.
  const anyName = contacts.find((c) => {
    const first = c.name.split(' ')[0].toLowerCase();
    return text.toLowerCase().includes(first);
  });
  if (anyName) return { name: anyName.name, phone: anyName.phone, confidence: 0.55 };
  return null;
}

/**
 * Resolve "emergency contact" / "primary" / "secondary" slot references.
 */
function resolveSlotReference(norm: string, contacts: EmergencyContact[]): ResolvedContact | null {
  if (/\b(emergen?c?y\s+contact|contact\s+d\s*urgence|contact\s+ya\s+dharura|mon\s+contact\s+d\s*urgence|urgent\s+contact)\b/.test(norm)) {
    const primary = contacts.find((c) => c.isPrimary) || contacts[0];
    if (primary?.phone) {
      return { name: primary.name, phone: primary.phone, confidence: 0.95, requiresConfirmation: false, clarifications: [] };
    }
    const secondary = contacts.find((c) => c.isSecondary) || (contacts[1] || contacts[0]);
    if (secondary?.phone) {
      return { name: secondary.name, phone: secondary.phone, confidence: 0.9, requiresConfirmation: false, clarifications: [] };
    }
  }

  if (/\b(primary|first|main|principal|ya mbere|first\s+contact|primary\s+contact)\b/.test(norm)) {
    const primary = contacts.find((c) => c.isPrimary) || contacts[0];
    if (primary?.phone) {
      return { name: primary.name, phone: primary.phone, confidence: 0.92, requiresConfirmation: false, clarifications: [] };
    }
  }

  if (/\b(secondary|backup|second|ya kabiri|msaidizi\s+wa\s+pili|backup\s+contact)\b/.test(norm)) {
    const secondary = contacts.find((c) => c.isSecondary) || (contacts[1] || contacts[0]);
    if (secondary?.phone) {
      return { name: secondary.name, phone: secondary.phone, confidence: 0.92, requiresConfirmation: false, clarifications: [] };
    }
  }

  return null;
}