import { describe, it, expect, beforeEach } from 'vitest';
import { processAgentTurn, isWebSearchConfigured } from '../src/services/aiAgent';
import { setAgentContextSources } from '../src/services/agentTools';
import { conversationMemory } from '../src/services/conversationMemory';
import { AgentContextSources, TelemetryReading, EmergencyContact } from '../src/types';

const alice: EmergencyContact = { id: 'c1', name: 'Alice Mukamana', phone: '+250700000001', isPrimary: true };
const bob: EmergencyContact = { id: 'c2', name: 'Bob Kayiranga', phone: '+250700000002' };
const reading: TelemetryReading = {
  deviceId: 'SW-001',
  timestamp: Date.now(),
  alcoholBac: 0.12,
  heartRateBpm: 82,
  spo2Percent: 97,
  tempCelsius: 36.5,
  sensorRaw: 0,
  status: 'CAUTION',
};

beforeEach(() => {
  conversationMemory.clear();
  setAgentContextSources({
    currentReading: () => reading,
    readings: () => [reading],
    contacts: () => [alice, bob],
    primaryContact: () => alice,
    secondaryContact: () => bob,
    emergencyState: () => 'NORMAL',
    uid: () => 'uid-1',
    deviceStatus: () => ({ deviceId: 'SW-001', online: true }),
  } as AgentContextSources);
});

describe('processAgentTurn (deterministic engine)', () => {
  it('recognizes an emergency request in Kinyarwanda and acts with countdown', async () => {
    const turn = await processAgentTurn('hamagara ubutabazi', 'rw', [alice, bob]);
    expect(turn.action).toBe('emergency');
    expect(['EMERGENCY_REQUEST', 'CALL_PRIMARY_CONTACT']).toContain(turn.match.intent);
  });

  it('recognizes an English emergency request', async () => {
    const turn = await processAgentTurn('call 112', 'en', []);
    expect(turn.action).toBe('emergency');
  });

  it('cancels an active emergency with the cancel intent', async () => {
    const turn = await processAgentTurn('cancel', 'en', []);
    expect(turn.action).toBe('cancel_emergency');
  });

  it('resolves an exact configured contact into a call action with real phone', async () => {
    const turn = await processAgentTurn('call Alice Mukamana', 'en', [alice, bob]);
    expect(turn.action).toBe('call');
    expect(turn.actionTarget?.phone).toBe('+250700000001');
    expect(turn.match.requiresConfirmation).toBeFalsy();
  });

  it('does NOT call on an ambiguous partial name: asks for confirmation', async () => {
    const turn = await processAgentTurn('call ali', 'en', [alice, bob]);
    expect(turn.action).toBe('none');
    expect(turn.match.requiresConfirmation).toBe(true);
  });

  it('NEVER invents a number for an unknown person', async () => {
    const turn = await processAgentTurn('call Zoe Ntare', 'en', [alice, bob]);
    expect(turn.action).toBe('none');
    expect(turn.match.extractedEntity?.contactPhone).toBeUndefined();
  });

  it('supports an automated voice message for SEND_VOICE_MESSAGE', async () => {
    const turn = await processAgentTurn('call Alice Mukamana tell them I am heading home now', 'en', [alice, bob]);
    expect(turn.match.intent).toBe('SEND_VOICE_MESSAGE');
    expect(turn.action).toBe('call');
    expect(turn.actionTarget?.phone).toBe('+250700000001');
    expect(turn.actionTarget?.message).toBeTruthy();
  });

  it('answers health checks from real tool data (never fabricated)', async () => {
    const turn = await processAgentTurn('check my health', 'en', []);
    expect(turn.action).toBe('none');
    expect(['CHECK_HEALTH', 'CHECK_ALCOHOL_STATUS', 'CHECK_DRIVING_READINESS']).toContain(turn.match.intent);
    expect(conversationMemory.getLastUserTurn()?.text).toBeTruthy();
  });

  it('CHEck heart rate uses the heartbeat tool', async () => {
    const turn = await processAgentTurn('how is my heart rate', 'en', []);
    expect(turn.match.intent).toBe('CHECK_HEART_RATE');
    expect(turn.match.toolsUsed).toContain('getHeartbeat');
  });

  it('reports driving readiness from real BAC', async () => {
    const turn = await processAgentTurn('am I okay to drive', 'en', []);
    expect(turn.match.intent).toBe('CHECK_DRIVING_READINESS');
    expect(turn.match.toolsUsed).toContain('getCurrentBAC');
  });

  it('web search is honest when no AI tool is configured', async () => {
    expect(isWebSearchConfigured()).toBe(false);
    const turn = await processAgentTurn('search for alcohol regulation', 'en', []);
    expect(turn.match.webSearchUsed).toBe(false);
    expect(turn.action).toBe('none');
  });

  it('falls back to UNKNOWN_COMMAND without hallucinating an answer', async () => {
    const turn = await processAgentTurn('xyqz rqxxizzle', 'en', []);
    expect(turn.match.intent).toBe('UNKNOWN_COMMAND');
    expect(turn.action).toBe('none');
  });

  it('keeps conversational context about a previously mentioned contact', async () => {
    await processAgentTurn('call Alice Mukamana', 'en', [alice, bob]);
    // Follow-up using the pronoun should resolve to the remembered contact.
    const turn = await processAgentTurn('call her', 'en', [alice, bob]);
    expect(turn.action).toBe('call');
    expect(turn.actionTarget?.name).toBe('Alice Mukamana');
  });

  it('handles many consecutive turns without degrading (no latch)', async () => {
    for (let i = 0; i < 10; i++) {
      const turn = await processAgentTurn('how is my heart rate', 'en', []);
      expect(turn.match.intent).toBe('CHECK_HEART_RATE');
    }
  });

  // ---------------------------------------------------------------------------
  // Acceptance phrases from the voice-pipeline specification.
  // ---------------------------------------------------------------------------

  it('maps "Reba uko meze." to the health-analysis intent', async () => {
    const turn = await processAgentTurn('Reba uko meze.', 'rw', [alice, bob]);
    expect(turn.match.intent).toBe('CHECK_HEALTH');
    expect(turn.match.toolsUsed).toContain('getCurrentBAC');
    expect(turn.action).toBe('none');
  });

  it('maps "Mbwira uko meze uyu munsi." to health-analysis', async () => {
    const turn = await processAgentTurn('Mbwira uko meze uyu munsi.', 'rw', [alice, bob]);
    expect(turn.match.intent).toBe('CHECK_HEALTH');
  });

  it('maps "Hamagara emergency contact." to calling the primary contact, not SOS', async () => {
    const turn = await processAgentTurn('Hamagara emergency contact.', 'rw', [alice, bob]);
    expect(turn.action).toBe('call');
    expect(turn.actionTarget?.phone).toBe('+250700000001');
    expect(turn.match.intent).toBe('CALL_CONTACT');
  });

  it('maps "Hamagara <unique name>." to a direct call when the name is unambiguous', async () => {
    const johns: EmergencyContact[] = [
      { id: 'j1', name: 'John Mugisha', phone: '+250700000010', isPrimary: true },
      { id: 'j2', name: 'Bob Kayiranga', phone: '+250700000002' },
    ];
    const turn = await processAgentTurn('Hamagara John.', 'rw', johns);
    expect(turn.match.intent).toBe('CALL_CONTACT');
    expect(turn.action).toBe('call');
    expect(turn.actionTarget?.phone).toBe('+250700000010');
    expect(turn.match.requiresConfirmation).toBeFalsy();
  });

  it('maps Kinyarwanda object-prefixed call "John muhagare." to CALL_CONTACT', async () => {
    const johns: EmergencyContact[] = [
      { id: 'j1', name: 'John Mugisha', phone: '+250700000010', isPrimary: true },
      { id: 'j2', name: 'Bob Kayiranga', phone: '+250700000002' },
    ];
    const turn = await processAgentTurn('John muhagare.', 'rw', johns);
    expect(turn.match.intent).toBe('CALL_CONTACT');
    expect(turn.action).toBe('call');
    expect(turn.actionTarget?.name).toBe('John Mugisha');
    expect(turn.actionTarget?.phone).toBe('+250700000010');
  });

  it('maps "Ndashaka kuvugana na Alice." to CALL_CONTACT', async () => {
    const turn = await processAgentTurn('Ndashaka kuvugana na Alice.', 'rw', [alice, bob]);
    expect(turn.match.intent).toBe('CALL_CONTACT');
    expect(turn.action).toBe('call');
  });

  it('maps "Please call Alice." to CALL_CONTACT', async () => {
    const turn = await processAgentTurn('Please call Alice.', 'en', [alice, bob]);
    expect(turn.match.intent).toBe('CALL_CONTACT');
    expect(turn.action).toBe('call');
    expect(turn.actionTarget?.name).toBe('Alice Mukamana');
  });

  it('maps mixed "Reba heartbeat yanjye hanyuma umbwire uko meze." to a heartbeat/health check', async () => {
    const turn = await processAgentTurn('Reba heartbeat yanjye hanyuma umbwire uko meze.', 'rw', [alice, bob]);
    expect(['CHECK_HEART_RATE', 'CHECK_HEALTH']).toContain(turn.match.intent);
    expect(turn.match.toolsUsed?.some((t) => t === 'getHeartbeat' || t === 'getCurrentBAC')).toBe(true);
  });

  it('maps "Fata location yanjye." to a location action', async () => {
    const turn = await processAgentTurn('Fata location yanjye.', 'rw', [alice, bob]);
    expect(turn.match.intent).toBe('CHECK_LOCATION');
    expect(turn.action).toBe('none');
  });

  it('maps "Mbwira BAC yanjye." and "Reba BAC yanjye." to alcohol status', async () => {
    const a = await processAgentTurn('Mbwira BAC yanjye.', 'rw', [alice, bob]);
    expect(a.match.intent).toBe('CHECK_ALCOHOL_STATUS');
    const b = await processAgentTurn('Reba BAC yanjye.', 'rw', [alice, bob]);
    expect(b.match.intent).toBe('CHECK_ALCOHOL_STATUS');
  });

  it('maps "Show my daily report." to a daily report check', async () => {
    const turn = await processAgentTurn('Show my daily report.', 'en', [alice, bob]);
    expect(turn.match.intent).toBe('CHECK_REPORT');
    expect(turn.match.toolsUsed).toContain('getDailyReport');
  });

  it('keeps genuine emergency requests as EMERGENCY_REQUEST (call 112/ubutabazi)', async () => {
    const a = await processAgentTurn('hamagara ubutabazi', 'rw', [alice, bob]);
    expect(a.action).toBe('emergency');
    const b = await processAgentTurn('call 112', 'en', [alice, bob]);
    expect(b.action).toBe('emergency');
  });

  it('does not classify "Hamagara John." as an emergency (contact name vs services)', async () => {
    const turn = await processAgentTurn('Hamagara John.', 'rw', [alice, bob]);
    expect(turn.match.intent).not.toBe('EMERGENCY_REQUEST');
  });
});