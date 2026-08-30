import { describe, it, expect } from 'vitest';
import { VoiceStateMachine } from '../src/services/voiceStateMachine';
import { VoiceAssistantStatus } from '../src/types';

describe('VoiceStateMachine', () => {
  it('starts idle', () => {
    const m = new VoiceStateMachine();
    expect(m.getState()).toBe('idle');
  });

  it('idle + START -> listening', () => {
    const m = new VoiceStateMachine();
    m.transition({ type: 'START' });
    expect(m.getState()).toBe('listening');
  });

  it('runs the full successful interaction loop back to listening', () => {
    const m = new VoiceStateMachine();
    expect(m.transition({ type: 'START' })).toBe('listening');
    expect(m.transition({ type: 'PARTIAL', text: 'call em' })).toBe('recognizing');
    expect(m.transition({ type: 'PARTIAL', text: 'call emergency' })).toBe('recognizing');
    expect(m.transition({ type: 'FINAL' })).toBe('processing');
    expect(m.transition({ type: 'TOOL_CALL' })).toBe('tool_calling');
    expect(m.transition({ type: 'SPEAK_START' })).toBe('speaking');
    expect(m.transition({ type: 'SPEAK_DONE' })).toBe('resuming_listening');
    // The agent is guaranteed to return to listening: any of RESUME_STARTED /
    // LISTENING_ACTIVE / START leads there after a completed interaction.
    expect(m.transition({ type: 'RESUME_STARTED' })).toBe('listening');
  });

  it('recognizing + FINAL -> processing even without partials', () => {
    const m = new VoiceStateMachine();
    m.transition({ type: 'START' });
    expect(m.transition({ type: 'FINAL' })).toBe('processing');
  });

  it('recoverable ERROR -> error_recovery, then back to listening', () => {
    const m = new VoiceStateMachine();
    m.transition({ type: 'START' });
    expect(m.transition({ type: 'ERROR', message: 'recognition busy, scheduling retry', recoverable: true })).toBe('error_recovery');
    expect(m.transition({ type: 'START' })).toBe('listening');
  });

  it('a second recoverable ERROR keeps recovery bounded (stays in error_recovery)', () => {
    const m = new VoiceStateMachine();
    m.transition({ type: 'START' });
    m.transition({ type: 'ERROR', message: 'network', recoverable: true });
    expect(m.transition({ type: 'ERROR', message: 'network', recoverable: true })).toBe('error_recovery');
  });

  it('permanent ERROR -> error, and only START recovers', () => {
    const m = new VoiceStateMachine();
    m.transition({ type: 'START' });
    expect(m.transition({ type: 'ERROR', message: 'mic-denied', recoverable: false })).toBe('error');
    // No transition from error except STOP/START/RESUME_STARTED.
    expect(m.transition({ type: 'SPEAK_DONE' })).toBe('error');
    expect(m.transition({ type: 'START' })).toBe('listening');
  });

  it('speaking is never lost on errors: SPEAK_DONE still resumes', () => {
    const m = new VoiceStateMachine();
    m.transition({ type: 'START' });
    m.transition({ type: 'FINAL' });
    m.transition({ type: 'SPEAK_START' });
    expect(m.transition({ type: 'SPEAK_DONE' })).toBe('resuming_listening');
  });

  it('any state can STOP back to idle', () => {
    const states: VoiceAssistantStatus[] = ['idle', 'listening', 'recognizing', 'processing', 'tool_calling', 'speaking', 'resuming_listening', 'error_recovery', 'error'];
    for (const state of states) {
      const m = new VoiceStateMachine();
      m.transition({ type: 'STOP' });
      expect(m.getState()).toBe('idle');
    }
  });

  it('canListen() is true only when a (re)start is safe', () => {
    const m = new VoiceStateMachine();
    expect(m.canListen()).toBe(true); // idle
    m.transition({ type: 'START' });
    expect(m.canListen()).toBe(true); // listening
    m.transition({ type: 'PARTIAL', text: 'x' });
    expect(m.canListen()).toBe(false); // recognizing
    m.transition({ type: 'FINAL' });
    expect(m.canListen()).toBe(false); // processing
    m.transition({ type: 'TOOL_CALL' });
    expect(m.canListen()).toBe(false); // tool_calling
    m.transition({ type: 'SPEAK_START' });
    expect(m.canListen()).toBe(false); // speaking
    m.transition({ type: 'SPEAK_DONE' });
    expect(m.canListen()).toBe(true); // resuming_listening
    m.transition({ type: 'ERROR', message: 'network', recoverable: true });
    expect(m.canListen()).toBe(true); // error_recovery
    m.transition({ type: 'ERROR', message: 'network', recoverable: true });
    expect(m.canListen()).toBe(true);
  });

  it('reports human-readable phase labels and bounded history', () => {
    const m = new VoiceStateMachine();
    expect(m.phase()).toBe('IDLE');
    m.transition({ type: 'START' });
    expect(m.phase()).toBe('LISTENING');
    expect(m.historyStates.length).toBeGreaterThanOrEqual(1);
  });

  it('reset returns to idle and clears history', () => {
    const m = new VoiceStateMachine();
    m.transition({ type: 'START' });
    m.transition({ type: 'FINAL' });
    m.reset();
    expect(m.getState()).toBe('idle');
    expect(m.historyStates.length).toBe(0);
  });
});