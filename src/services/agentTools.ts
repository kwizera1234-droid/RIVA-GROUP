import { AgentContextSources, TelemetryReading, EmergencyContact } from '../types';
import {
  calculateReport,
  calculateDailyReport,
  calculateWeeklyReport,
  calculateMonthlyReport,
} from './reportEngine';
import { average, range } from '../utils/telemetry';
import { getLocalEmergencyHistory } from './api';

/**
 * SoberWatch context tools.
 *
 * These expose REAL, live SoberWatch data to the AI agent. They never
 * fabricate results: when a value is unavailable or stale, the tool returns an
 * explicit status so the agent can say so honestly.
 *
 * IMPORTANT: Only the requested metric is returned (no wholesale database
 * injection into the prompt).
 */

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

let sources: AgentContextSources | null = null;

export function setAgentContextSources(next: AgentContextSources | null) {
  sources = next;
}

function getSources(): AgentContextSources {
  if (!sources) {
    throw new Error('Agent context sources are not wired yet.');
  }
  return sources;
}

function readings(): TelemetryReading[] {
  try {
    return getSources().readings() || [];
  } catch {
    return [];
  }
}

function current(): TelemetryReading | null {
  try {
    return getSources().currentReading() || null;
  } catch {
    return null;
  }
}

function present(values: Array<number | null | undefined>): number[] {
  return (values || []).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

export function toolGetCurrentBAC(): ToolResult {
  const reading = current();
  if (!reading || reading.alcoholBac === null || reading.alcoholBac === undefined) {
    return { ok: false, error: 'No current BAC reading is available.' };
  }
  return {
    ok: true,
    data: {
      bac: reading.alcoholBac,
      unit: '% BAC',
      status: reading.status,
      timestamp: reading.timestamp,
    },
  };
}

export function toolGetBACHistory(): ToolResult {
  const list = readings().map((r) => ({ at: r.timestamp, bac: r.alcoholBac })).filter((r) => typeof r.bac === 'number');
  if (list.length === 0) return { ok: false, error: 'No BAC history is available.' };
  return {
    ok: true,
    data: {
      count: list.length,
      latest: list[list.length - 1],
      earliest: list[0],
      average: average(list.map((r) => r.bac as number)),
      minMax: range(list.map((r) => r.bac as number)),
    },
  };
}

export function toolGetHeartbeat(): ToolResult {
  const reading = current();
  const hr = reading && typeof reading.heartRateBpm === 'number' ? reading.heartRateBpm : null;
  const history = present(readings().map((r) => r.heartRateBpm));
  const hrRange = range(history);

  return {
    ok: hr !== null,
    data: {
      currentHeartRate: hr,
      unit: 'bpm',
      recentTrend: history.length >= 2 ? average(history.slice(-5)) : hr,
      personalBaseline: history.length ? average(history) : null,
      recentMin: hrRange.min,
      recentMax: hrRange.max,
      sampleCount: history.length,
      dataQuality: history.length === 0 ? 'none' : history.length < 5 ? 'limited' : 'good',
      timestamp: reading?.timestamp ?? null,
    },
    error: hr === null ? 'No current heart rate reading is available.' : undefined,
  };
}

export function toolGetHeartRateHistory(): ToolResult {
  const history = readings()
    .map((r) => ({ at: r.timestamp, bpm: r.heartRateBpm }))
    .filter((r) => typeof r.bpm === 'number');
  const values = present(history.map((r) => r.bpm as number));
  if (values.length === 0) return { ok: false, error: 'No heart rate history is available.' };
  return { ok: true, data: { count: values.length, average: average(values), minMax: range(values), samples: history } };
}

export function toolGetSpO2(): ToolResult {
  const reading = current();
  const spo2 = reading && typeof reading.spo2Percent === 'number' ? reading.spo2Percent : null;
  const history = present(readings().map((r) => r.spo2Percent));
  return {
    ok: spo2 !== null,
    data: { currentSpO2: spo2, unit: '%', recentMin: range(history).min, recentMax: range(history).max, sampleCount: history.length },
    error: spo2 === null ? 'No current SpO2 reading is available.' : undefined,
  };
}

export function toolGetTemperature(): ToolResult {
  const reading = current();
  const temp = reading && typeof reading.tempCelsius === 'number' ? reading.tempCelsius : null;
  const history = present(readings().map((r) => r.tempCelsius));
  return {
    ok: temp !== null,
    data: { currentTemperature: temp, unit: 'C', recentMin: range(history).min, recentMax: range(history).max, sampleCount: history.length },
    error: temp === null ? 'No current temperature reading is available.' : undefined,
  };
}

export function toolGetDrivingReadiness(): ToolResult {
  const reading = current();
  const bac = reading?.alcoholBac;
  if (bac === null || bac === undefined) {
    return { ok: false, error: 'No BAC reading is available to evaluate driving readiness.' };
  }
  const legalLimit = 0.08;
  const cautionLimit = 0.02;
  return {
    ok: true,
    data: {
      bac,
      legalLimit,
      ready: bac < legalLimit,
      recommended: bac >= legalLimit ? 'do_not_drive' : bac >= cautionLimit ? 'caution' : 'ok',
      readingStatus: reading?.status,
    },
  };
}

export function toolGetDrivingContext(): ToolResult {
  const reading = current();
  if (!reading) return { ok: false, error: 'No current telemetry is available.' };
  const status = reading.status;
  const recentStatuses = readings().slice(-6).map((r) => r.status);
  return {
    ok: true,
    data: {
      currentStatus: status,
      recentStatuses,
      hasCriticalReading: recentStatuses.includes('DANGER'),
      deviceId: reading.deviceId,
    },
  };
}

export function toolGetCurrentLocation(rawShareRequired = false): ToolResult {
  // Location is handled by the emergency service workflow (fresh GPS, not
  // cached, not logged raw). This tool only signals AVAILABILITY; the actual
  // coordinate is acquired by the share workflow to keep raw coordinates out
  // of prompt context.
  return {
    ok: false,
    data: {
      available: false,
      shareRequiredByUser: rawShareRequired,
      note: 'A fresh location is acquired only by the native location workflow.',
    },
    error: 'Current GPS location is not available in telemetry context.',
  };
}

export function toolGetEmergencyContacts(): ToolResult {
  try {
    const contacts: EmergencyContact[] = getSources().contacts() || [];
    const primary = getSources().primaryContact();
    const secondary = getSources().secondaryContact();
    if (contacts.length === 0 && !primary && !secondary) {
      return { ok: false, error: 'No emergency contacts are configured.' };
    }
    return {
      ok: true,
      data: {
        count: contacts.length,
        names: contacts.map((c) => c.name),
        primaryName: primary?.name ?? null,
        secondaryName: secondary?.name ?? null,
        note: 'Numbers are resolved only at call time through the safe Android call flow.',
      },
    };
  } catch {
    return { ok: false, error: 'No emergency contacts are available.' };
  }
}

export function toolGetRecentAlerts(): ToolResult {
  const history = getLocalEmergencyHistory() || [];
  const recent = history.slice(0, 10).map((e) => ({
    id: e.id,
    type: e.type,
    state: e.state,
    timestamp: e.timestamp,
    notes: e.notes,
    callStatus: e.callStatus,
  }));
  const reading = current();
  const critical = reading?.status === 'DANGER';
  return {
    ok: true,
    data: { recentEvents: recent, currentStatusIsCritical: critical, currentStatus: reading?.status ?? null },
  };
}

export function toolGetDeviceStatus(): ToolResult {
  const reading = current();
  try {
    const status = getSources().deviceStatus();
    return {
      ok: true,
      data: {
        deviceId: reading?.deviceId ?? status?.deviceId ?? null,
        lastReadingAt: reading?.timestamp ?? null,
        online: status?.online ?? false,
        sensorDataPresent: !!reading,
      },
    };
  } catch {
    return {
      ok: true,
      data: { deviceId: reading?.deviceId ?? null, lastReadingAt: reading?.timestamp ?? null, online: false, sensorDataPresent: !!reading },
    };
  }
}

export function toolGetDailyReport(): ToolResult {
  const report = calculateDailyReport(readings());
  if (report.readings.length === 0) return { ok: false, error: 'No readings are available for today yet.' };
  return { ok: true, data: summarizeReport(report) };
}

export function toolGetWeeklyReport(): ToolResult {
  const report = calculateWeeklyReport(readings());
  if (report.readings.length === 0) return { ok: false, error: 'No readings are available for the last 7 days.' };
  return { ok: true, data: summarizeReport(report) };
}

export function toolGetMonthlyReport(): ToolResult {
  const report = calculateMonthlyReport(readings());
  if (report.readings.length === 0) return { ok: false, error: 'No readings are available for this month yet.' };
  return { ok: true, data: summarizeReport(report) };
}

function summarizeReport(report: ReturnType<typeof calculateReport>) {
  return {
    period: { start: report.start, end: report.end },
    averageBac: report.averageBac,
    highestBac: report.highestBac,
    averageHeartRate: report.averageHeartRate,
    minHeartRate: report.minHeartRate,
    maxHeartRate: report.maxHeartRate,
    averageSpO2: report.averageSpo2,
    averageTemperature: report.averageTemperature,
    safe: report.safe,
    caution: report.caution,
    danger: report.danger,
    trend: report.trend,
    dataQuality: report.dataQuality,
    riskPeriods: report.riskPeriods,
    score: report.score,
    scoreStatus: report.scoreStatus,
    recommendations: report.recommendations,
  };
}

/**
 * Tool registry used by both the LLM function-calling layer and the
 * deterministic fallback. Names match the requested tool list.
 */
export const AGENT_TOOLS: Record<string, () => ToolResult> = {
  getCurrentBAC: toolGetCurrentBAC,
  getBACHistory: toolGetBACHistory,
  getHeartbeat: toolGetHeartbeat,
  getHeartRateHistory: toolGetHeartRateHistory,
  getSpO2: toolGetSpO2,
  getTemperature: toolGetTemperature,
  getDrivingReadiness: toolGetDrivingReadiness,
  getDrivingContext: toolGetDrivingContext,
  getCurrentLocation: () => toolGetCurrentLocation(false),
  getEmergencyContacts: toolGetEmergencyContacts,
  getRecentAlerts: toolGetRecentAlerts,
  getDeviceStatus: toolGetDeviceStatus,
  getDailyReport: toolGetDailyReport,
  getWeeklyReport: toolGetWeeklyReport,
  getMonthlyReport: toolGetMonthlyReport,
};

export function executeAgentTool(name: string): ToolResult {
  const tool = AGENT_TOOLS[name];
  if (!tool) return { ok: false, error: `Unknown tool: ${name}` };
  try {
    return tool();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Tool execution failed.' };
  }
}