import { Language, VoiceIntent } from '../types';

/**
 * Bounded, privacy-safe short-term conversational memory for the SoberWatch
 * voice agent.
 *
 * - Holds only the most recent N turns (default 8) so context never grows
 *   without limit.
 * - Tracks lightweight entities (contact names, locations) referenced in the
 *   conversation so follow-ups like "call him" or "what about my heart" can be
 *   resolved without the user repeating themselves.
 * - Nothing is persisted; there is no long-term storage. `clear()` wipes
 *   everything (logout, session end).
 */

export interface ConversationTurn {
  role: 'user' | 'assistant';
  text: string;
  intent?: VoiceIntent;
  toolsUsed?: string[];
  at: number;
}

export interface ConversationEntity {
  type: 'contact' | 'location' | 'topic' | 'value' | 'language';
  name: string;
  value?: string;
  at: number;
}

const DEFAULT_MAX_TURNS = 8;

export class ConversationMemory {
  private turns: ConversationTurn[] = [];
  private entities: ConversationEntity[] = [];
  private maxTurns: number;
  private correctionApplied: boolean | null = null;

  constructor(maxTurns = DEFAULT_MAX_TURNS) {
    this.maxTurns = maxTurns;
  }

  public addTurn(turn: ConversationTurn) {
    this.turns.push(turn);
    if (this.turns.length > this.maxTurns) {
      this.turns = this.turns.slice(this.turns.length - this.maxTurns);
    }
  }

  public addUserTurn(text: string, intent?: VoiceIntent, toolsUsed?: string[]) {
    this.addTurn({ role: 'user', text, intent, toolsUsed, at: Date.now() });
  }

  public addAssistantTurn(text: string, toolsUsed?: string[]) {
    this.addTurn({ role: 'assistant', text, toolsUsed, at: Date.now() });
  }

  public rememberEntity(type: ConversationEntity['type'], name: string, value?: string) {
    const existing = this.entities.find((e) => e.type === type && e.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      existing.value = value ?? existing.value;
      existing.at = Date.now();
      return;
    }
    this.entities.push({ type, name, value, at: Date.now() });
    // Cap concurrent entities to keep context tiny.
    if (this.entities.length > 8) {
      this.entities = this.entities
        .sort((a, b) => b.at - a.at)
        .slice(0, 8);
    }
  }

  /**
   * Last entity of a type (e.g. the most recent contact mentioned).
   * Entities registered within the same millisecond are tie-broken by
   * insertion order so the most recently referenced one wins deterministically.
   */
  public getEntity(type: ConversationEntity['type']): ConversationEntity | undefined {
    return [...this.entities]
      .filter((e) => e.type === type)
      .sort((a, b) => b.at - a.at || this.entities.indexOf(b) - this.entities.indexOf(a))[0];
  }

  public getLastUserTurn(): ConversationTurn | undefined {
    return [...this.turns].reverse().find((t) => t.role === 'user');
  }

  public getLastAssistantTurn(): ConversationTurn | undefined {
    return [...this.turns].reverse().find((t) => t.role === 'assistant');
  }

  public recentUserIntents(count = 3): VoiceIntent[] {
    return this.turns
      .filter((t) => t.role === 'user' && t.intent)
      .slice(-count)
      .map((t) => t.intent as VoiceIntent);
  }

  /**
   * Whether a user correction was applied on the latest turn ("no, John",
   * "I meant James"). Used to reduce re-correction.
   */
  public setCorrectionApplied(value: boolean | null) {
    this.correctionApplied = value;
  }

  public getCorrectionApplied(): boolean | null {
    return this.correctionApplied;
  }

  /**
   * Compact, prompt-safe summary of recent context. Never includes health
   * values, phone numbers, or location coordinates — only that the data exists
   * so the agent knows to re-query a tool.
   */
  public getContextWindow(language: Language = 'en'): string {
    if (this.turns.length === 0) return '';

    const latest = this.turns
      .map((t) => `${t.role === 'user' ? 'user' : 'assistant'}: ${t.text.replace(/\s+/g, ' ').trim()}`)
      .join('\n');

    const topic = this.getEntity('topic');
    const contact = this.getEntity('contact');
    const parts: string[] = [];
    if (topic) parts.push(`current topic: ${topic.name}`);
    if (contact) parts.push(`recently referenced contact: ${contact.name}`);

    return `${latest}${parts.length ? `\ncontext: ${parts.join('; ')}` : ''}`;
  }

  public clear() {
    this.turns = [];
    this.entities = [];
    this.correctionApplied = null;
  }

  public reset() {
    this.clear();
  }

  public size(): number {
    return this.turns.length;
  }
}

export const conversationMemory = new ConversationMemory();