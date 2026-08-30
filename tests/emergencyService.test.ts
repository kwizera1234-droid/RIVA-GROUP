import { describe, it, expect, beforeEach } from 'vitest';
import { emergencyService } from '../src/services/emergencyService';
import { EmergencyContact } from '../src/types';

const CONTACTS_KEY = 'soberwatch_contacts';

const contacts: EmergencyContact[] = [
  { id: 'c1', name: 'Alice Mukamana', phone: '+250700000001', isPrimary: true },
  { id: 'c2', name: 'Bob Kayiranga', phone: '+250700000002', isSecondary: true },
];

describe('EmergencyService contact source (used by the AI agent)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reads the live contact list from shared storage', () => {
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
    const list = emergencyService.getContacts();
    expect(list).toHaveLength(2);
    expect(list[0].phone).toBe('+250700000001');
  });

  it('returns an empty list, never invented data, when nothing is stored', () => {
    expect(emergencyService.getContacts()).toEqual([]);
  });

  it('tolerates invalid stored JSON without crashing', () => {
    localStorage.setItem(CONTACTS_KEY, '{broken json');
    expect(emergencyService.getContacts()).toEqual([]);
  });
});