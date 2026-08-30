import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationMemory } from '../src/services/conversationMemory';

describe('ConversationMemory', () => {
  let mem: ConversationMemory;

  beforeEach(() => {
    mem = new ConversationMemory();
  });

  it('bounds the number of turns, dropping the oldest', () => {
    for (let i = 1; i <= 12; i++) {
      mem.addUserTurn(`turn ${i}`);
    }
    expect(mem.size()).toBe(8);
    const window = mem.getContextWindow();
    expect(window).toContain('user: turn 12');
    expect(window).not.toContain('user: turn 4');
  });

  it('tracks the last user and assistant turns', () => {
    mem.addUserTurn('check my heart');
    mem.addAssistantTurn('Your heart rate is 82 bpm.');
    expect(mem.getLastUserTurn()?.text).toBe('check my heart');
    expect(mem.getLastAssistantTurn()?.text).toBe('Your heart rate is 82 bpm.');
  });

  it('remembers and returns the most recent contact entity', () => {
    mem.rememberEntity('contact', 'Alice', '+250700000001');
    mem.rememberEntity('contact', 'Bob', '+250700000002');
    mem.rememberEntity('topic', 'call');
    const contact = mem.getEntity('contact');
    expect(contact).toBeDefined();
    expect(contact?.name).toBe('Bob');
    expect(contact?.value).toBe('+250700000002');
  });

  it('rounds duplicate entity writes up-to-date but not duplicated', () => {
    mem.rememberEntity('contact', 'Alice');
    mem.rememberEntity('contact', 'Alice', '+250700000001');
    const contacts = mem.getEntity('contact');
    expect(contacts?.value).toBe('+250700000001');
  });

  it('context window never includes raw phone numbers', () => {
    mem.rememberEntity('contact', 'Alice', '+250700000001');
    mem.addUserTurn('call Alice');
    const window = mem.getContextWindow();
    expect(window).toContain('Alice');
    expect(window).not.toContain('+250700000001');
  });

  it('clear wipes everything (logout session end)', () => {
    mem.addUserTurn('call emergency');
    mem.rememberEntity('contact', 'Alice');
    mem.clear();
    expect(mem.size()).toBe(0);
    expect(mem.getEntity('contact')).toBeUndefined();
    expect(mem.getContextWindow()).toBe('');
  });
});