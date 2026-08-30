import { VoiceAssistantStatus } from '../types';

/**
 * Explicit voice-pipeline state machine.
 *
 * LISTENING → PROCESSING → (TOOL_CALLING) → SPEAKING → RESUMING_LISTENING → LISTENING
 * and ERROR_RECOVERY between any state and LISTENING/IDLE.
 *
 * The machine guarantees that after every completed interaction the agent
 * returns to LISTENING (never left in an unknown state). All transitions are
 * legal-transition-checked and emit events so the voice service can schedule
 * timers (restart with backoff) without allowing infinite restart loops.
 */

export type VoiceStateEvent =
  | { type: 'START' }
  | { type: 'LISTENING_ACTIVE' }
  | { type: 'PARTIAL'; text: string }
  | { type: 'FINAL' }
  | { type: 'TOOL_CALL' }
  | { type: 'SPEAK_START' }
  | { type: 'SPEAK_DONE' }
  | { type: 'RESUME_STARTED' }
  | { type: 'ERROR'; message: string; recoverable: boolean }
  | { type: 'STOP' };

export interface StateTransition {
  from: VoiceAssistantStatus;
  to: VoiceAssistantStatus;
}

export class VoiceStateMachine {
  private state: VoiceAssistantStatus = 'idle';
  private listener: ((state: VoiceAssistantStatus, event: VoiceStateEvent) => void) | null = null;
  private history: VoiceAssistantStatus[] = [];

  constructor(onTransition?: (state: VoiceAssistantStatus, event: VoiceStateEvent) => void) {
    this.listener = onTransition ?? null;
  }

  public getState(): VoiceAssistantStatus {
    return this.state;
  }

  public get historyStates(): VoiceAssistantStatus[] {
    return [...this.history];
  }

  /**
   * Pure transition table: returns the next state for a given event from a
   * given state. Kept as a standalone function so tests can exercise legality
   * without a machine instance.
   */
  public static nextState(state: VoiceAssistantStatus, event: VoiceStateEvent): VoiceAssistantStatus {
    switch (state) {
      case 'idle':
        if (event.type === 'START') return 'listening';
        if (event.type === 'STOP') return 'idle';
        if (event.type === 'ERROR') return event.recoverable ? 'error_recovery' : 'idle';
        return 'idle';

      case 'listening':
        if (event.type === 'STOP') return 'idle';
        if (event.type === 'LISTENING_ACTIVE') return 'listening';
        if (event.type === 'PARTIAL') return 'recognizing';
        if (event.type === 'FINAL') return 'processing';
        if (event.type === 'ERROR') return event.recoverable ? 'error_recovery' : 'error';
        return 'listening';

      case 'recognizing':
        if (event.type === 'STOP') return 'idle';
        if (event.type === 'PARTIAL') return 'recognizing';
        if (event.type === 'FINAL') return 'processing';
        if (event.type === 'ERROR') return event.recoverable ? 'error_recovery' : 'error';
        return 'recognizing';

      case 'processing':
        if (event.type === 'STOP') return 'idle';
        if (event.type === 'TOOL_CALL') return 'tool_calling';
        if (event.type === 'SPEAK_START') return 'speaking';
        if (event.type === 'ERROR') return event.recoverable ? 'error_recovery' : 'error';
        return 'processing';

      case 'tool_calling':
        if (event.type === 'STOP') return 'idle';
        if (event.type === 'TOOL_CALL') return 'tool_calling';
        if (event.type === 'SPEAK_START') return 'speaking';
        if (event.type === 'ERROR') return event.recoverable ? 'error_recovery' : 'error';
        return 'tool_calling';

      case 'speaking':
        if (event.type === 'STOP') return 'idle';
        if (event.type === 'SPEAK_DONE') return 'resuming_listening';
        if (event.type === 'ERROR') return event.recoverable ? 'error_recovery' : 'error';
        return 'speaking';

      case 'resuming_listening':
        if (event.type === 'STOP') return 'idle';
        if (event.type === 'RESUME_STARTED') return 'listening';
        if (event.type === 'LISTENING_ACTIVE') return 'listening';
        if (event.type === 'START') return 'listening';
        if (event.type === 'ERROR') return event.recoverable ? 'error_recovery' : 'error';
        return 'resuming_listening';

      case 'error_recovery':
        if (event.type === 'STOP') return 'idle';
        if (event.type === 'START') return 'listening';
        if (event.type === 'LISTENING_ACTIVE') return 'listening';
        if (event.type === 'RESUME_STARTED') return 'listening';
        if (event.type === 'ERROR') {
          // A second error during recovery keeps us in recovery (bounded by the
          // caller's backoff policy); a permanent error surfaces as 'error'.
          return event.recoverable ? 'error_recovery' : 'error';
        }
        return 'error_recovery';

      case 'error':
        if (event.type === 'STOP') return 'idle';
        if (event.type === 'START') return 'listening';
        if (event.type === 'RESUME_STARTED') return 'listening';
        return 'error';

      default:
        return state;
    }
  }

  public transition(event: VoiceStateEvent): VoiceAssistantStatus {
    const next = VoiceStateMachine.nextState(this.state, event);
    if (next !== this.state) {
      this.history.push(this.state);
      if (this.history.length > 24) this.history.shift();
      this.state = next;
    }
    this.listener?.(this.state, event);
    return this.state;
  }

  /**
   * Whether it is currently safe for the listener to (re)start.
   */
  public canListen(): boolean {
    return this.state === 'idle' || this.state === 'listening' ||
      this.state === 'resuming_listening' || this.state === 'error_recovery' || this.state === 'error';
  }

  /**
   * A human-readable phase label for debug logs only.
   */
  public phase(): string {
    switch (this.state) {
      case 'idle': return 'IDLE';
      case 'listening': return 'LISTENING';
      case 'recognizing': return 'RECOGNIZING';
      case 'processing': return 'PROCESSING';
      case 'tool_calling': return 'TOOL_CALLING';
      case 'speaking': return 'SPEAKING';
      case 'resuming_listening': return 'RESUMING_LISTENING';
      case 'error_recovery': return 'ERROR_RECOVERY';
      case 'error': return 'ERROR';
      default: return String(this.state).toUpperCase();
    }
  }

  public reset() {
    this.state = 'idle';
    this.history = [];
  }
}

export const voiceStateMachine = new VoiceStateMachine();