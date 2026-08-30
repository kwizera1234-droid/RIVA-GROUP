import { describe, it, expect } from 'vitest';
import { correctSpeech, matchContactFragment } from '../src/services/speechCorrector';
import { EmergencyContact } from '../src/types';

const contacts: EmergencyContact[] = [
  { id: 'c1', name: 'Alice Mukamana', phone: '+250700000001', relationship: 'mama' },
  { id: 'c2', name: 'John Mugisha', phone: '+250700000002', relationship: 'brother' },
  { id: 'c3', name: 'Alice Niyonzima', phone: '+250700000003', isPrimary: true },
];

describe('correctSpeech', () => {
  it('detects "no, X" self-correction and keeps the final target', () => {
    const result = correctSpeech('call James no John', contacts);
    expect(result.hadCorrection).toBe(true);
    expect(result.correctedName).toBe('John');
  });

  it('detects Kinyarwanda "oya, X" and French/Swahili markers', () => {
    expect(correctSpeech('hamagara Jean oya, Alice', contacts).correctedName).toBe('Alice');
    expect(correctSpeech('non, Jean', contacts).hadCorrection).toBe(true);
    expect(correctSpeech('hapana, John', contacts).hadCorrection).toBe(true);
  });

  it('detects "I meant X" and "actually X"', () => {
    expect(correctSpeech('I meant John', contacts).correctedName).toBe('John');
    expect(correctSpeech('actually Bob', contacts).hadCorrection).toBe(true);
  });

  it('fixes common transcription errors like "emergen cy contact"', () => {
    const result = correctSpeech('call my emergen cy contact', contacts);
    expect(result.correctedText).toContain('emergency contact');
    expect(result.confidence).toBeLessThan(1);
  });

  it('returns empty result for empty input', () => {
    const result = correctSpeech('');
    expect(result.correctedText).toBe('');
    expect(result.hadCorrection).toBe(false);
  });
});

describe('matchContactFragment', () => {
  it('matches exact normalized names with high confidence', () => {
    const match = matchContactFragment('Alice Mukamana', contacts);
    expect(match).not.toBeNull();
    expect(match?.phone).toBe('+250700000001');
    expect(match?.confidence).toBe(0.98);
  });

  it('matches relationship slots (mama / brother / sister)', () => {
    const mama = matchContactFragment('call mama', contacts);
    expect(mama?.name).toBe('Alice Mukamana');
    expect(mama?.confidence).toBe(0.92);
    const bro = matchContactFragment('call brother', contacts);
    expect(bro?.name).toBe('John Mugisha');
  });

  it('matches "emergency contact" and "primary" slots', () => {
    const primary = matchContactFragment('call emergency contact', contacts);
    expect(primary?.name).toBe('Alice Niyonzima'); // isPrimary
    expect(primary?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('fuzzy prefix matches partial names with lower confidence', () => {
    const match = matchContactFragment('call ali', contacts);
    expect(match).not.toBeNull();
    expect(match!.confidence).toBeLessThan(0.8);
  });

  it('returns null when nothing matches and no invention happens', () => {
    expect(matchContactFragment('call zoe', contacts)).toBeNull();
    expect(matchContactFragment('', contacts)).toBeNull();
    expect(matchContactFragment('call brother', [])).toBeNull();
  });
});