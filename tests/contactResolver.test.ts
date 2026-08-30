import { describe, it, expect } from 'vitest';
import { resolveContact } from '../src/services/contactResolver';
import { EmergencyContact } from '../src/types';

const contacts: EmergencyContact[] = [
  { id: 'c1', name: 'Alice Mukamana', phone: '+250700000001', isPrimary: true, relationship: 'mama' },
  { id: 'c2', name: 'Bob Kayiranga', phone: '+250700000002', isSecondary: true },
];

describe('resolveContact', () => {
  it('resolves an exact, fully-confident call target without confirmation', () => {
    const resolved = resolveContact('call Alice Mukamana', { contacts });
    expect(resolved).not.toBeNull();
    expect(resolved?.phone).toBe('+250700000001');
    expect(resolved?.name).toBe('Alice Mukamana');
    expect(resolved?.requiresConfirmation).toBe(false);
  });

  it('resolves slot references: emergency contact -> primary', () => {
    const resolved = resolveContact('call emergency contact', { contacts });
    expect(resolved?.name).toBe('Alice Mukamana');
    expect(resolved?.requiresConfirmation).toBe(false);
  });

  it('resolves pronoun references to the last mentioned contact', () => {
    const resolved = resolveContact('call her', {
      contacts,
      lastMentionedContact: { id: 'c1', name: 'Alice Mukamana', phone: '+250700000001' },
    });
    expect(resolved?.name).toBe('Alice Mukamana');
    expect(resolved?.phone).toBe('+250700000001');
  });

  it('requires confirmation for low-confidence fuzzy matches on dangerous actions', () => {
    const resolved = resolveContact('call ali', { contacts });
    expect(resolved).not.toBeNull();
    expect(resolved?.name).toBe('Alice Mukamana');
    expect(resolved?.requiresConfirmation).toBe(true);
    expect(resolved?.clarifications.length).toBeGreaterThan(0);
  });

  it('NEVER invents a phone number for an unknown contact', () => {
    const resolved = resolveContact('call Zoe Ntare', { contacts });
    expect(resolved).toBeNull();
  });

  it('returns null on empty input', () => {
    expect(resolveContact('', { contacts })).toBeNull();
    expect(resolveContact('  ', { contacts })).toBeNull();
  });

  it('never resolves when the contact list is empty', () => {
    expect(resolveContact('call Alice', { contacts: [] })).toBeNull();
  });
});