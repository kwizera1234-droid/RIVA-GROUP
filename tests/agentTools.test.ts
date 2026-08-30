import { describe, it, expect, beforeEach } from 'vitest';
import {
  setAgentContextSources,
  toolGetCurrentBAC,
  toolGetBACHistory,
  toolGetHeartbeat,
  toolGetSpO2,
  toolGetTemperature,
  toolGetDrivingReadiness,
  toolGetDrivingContext,
  toolGetEmergencyContacts,
  toolGetDeviceStatus,
  toolGetDailyReport,
  executeAgentTool,
} from '../src/services/agentTools';
import { AgentContextSources, TelemetryReading, EmergencyContact } from '../src/types';

const alice: EmergencyContact = { id: 'c1', name: 'Alice Mukamana', phone: '+250700000001', isPrimary: true };
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

function wire(overrides: Partial<TelemetryReading> = {}, readings: TelemetryReading[] = []) {
  const current: TelemetryReading = { ...reading, ...overrides };
  const sources: AgentContextSources = {
    currentReading: () => current,
    readings: () => readings.length ? readings : [current],
    contacts: () => [alice],
    primaryContact: () => alice,
    secondaryContact: () => null,
    emergencyState: () => 'NORMAL',
    uid: () => 'uid-1',
    deviceStatus: () => ({ deviceId: 'SW-001', online: true }),
  };
  setAgentContextSources(sources);
  return { current, sources };
}

describe('agentTools (real data only, never fabricated)', () => {
  beforeEach(() => {
    setAgentContextSources(null);
  });

  it('reports unavailability honestly when nothing is wired', () => {
    const bac = toolGetCurrentBAC();
    expect(bac.ok).toBe(false);
    expect(bac.error).toBeTruthy();
    expect(bac.data).toBeUndefined();
  });

  it('getCurrentBAC returns the real reading when available', () => {
    wire();
    const bac = toolGetCurrentBAC();
    expect(bac.ok).toBe(true);
    expect((bac.data as { bac: number }).bac).toBe(0.12);
  });

  it('getHeartbeat uses real heart rate + history', () => {
    wire();
    const hr = toolGetHeartbeat();
    expect(hr.ok).toBe(true);
    expect((hr.data as { currentHeartRate: number }).currentHeartRate).toBe(82);
  });

  it('getSpO2 / getTemperature report missing values as errors, never fake numbers', () => {
    wire({ spo2Percent: null, tempCelsius: null });
    expect(toolGetSpO2().ok).toBe(false);
    expect(toolGetTemperature().ok).toBe(false);
  });

  it('getDrivingReadiness marks a 0.12 BAC as do-not-drive', () => {
    wire();
    const dr = toolGetDrivingReadiness();
    expect(dr.ok).toBe(true);
    expect((dr.data as { ready: boolean; recommended: string }).ready).toBe(false);
    expect((dr.data as { ready: boolean; recommended: string }).recommended).toBe('do_not_drive');
  });

  it('getDrivingContext reports critical status when DANGER present', () => {
    wire({}, [{ ...reading, status: 'SAFE' }, { ...reading, status: 'DANGER' }]);
    const ctx = toolGetDrivingContext();
    expect((ctx.data as { hasCriticalReading: boolean }).hasCriticalReading).toBe(true);
  });

  it('getEmergencyContacts returns real configured contacts (names only, no prompts)', () => {
    wire();
    const cons = toolGetEmergencyContacts();
    expect(cons.ok).toBe(true);
    expect((cons.data as { names: string[] }).names).toContain('Alice Mukamana');
    expect(JSON.stringify(cons.data)).not.toContain('+250700000001');
  });

  it('getDeviceStatus reports sensor presence based on real data', () => {
    wire();
    const ds = toolGetDeviceStatus();
    expect((ds.data as { sensorDataPresent: boolean }).sensorDataPresent).toBe(true);
  });

  it('daily report refuses to fabricate when there are no readings', () => {
    // Unwired (no sources) -> empty readings -> honest refusal.
    const report = toolGetDailyReport();
    expect(report.ok).toBe(false);
    expect(report.error).toBeTruthy();
  });

  it('executeAgentTool returns an error for unknown tool names', () => {
    const out = executeAgentTool('makeMeCoffee');
    expect(out.ok).toBe(false);
    expect(out.error).toContain('Unknown tool');
  });

  it('executeAgentTool dispatches through the registry', () => {
    wire();
    const out = executeAgentTool('getCurrentBAC');
    expect(out.ok).toBe(true);
  });
});