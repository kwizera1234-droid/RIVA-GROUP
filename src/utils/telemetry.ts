import { ReadingStatus, TelemetryReading } from '../types';

export const isPresent = (value: number | string | null | undefined): value is number | string =>
  value !== null && value !== undefined;

export function formatMetric(value: number | string | null | undefined, suffix = '', empty = 'No data yet'): string {
  return isPresent(value) ? `${value}${suffix}` : empty;
}

export function formatBac(value: number | null | undefined): string {
  return isPresent(value) ? `${value.toFixed(3)} % BAC` : 'No data yet';
}

export function statusForBac(value: number | null | undefined): ReadingStatus | null {
  if (!isPresent(value)) return null;
  return value >= 0.08 ? 'DANGER' : value >= 0.02 ? 'CAUTION' : 'SAFE';
}

export function average(values: Array<number | null | undefined>): number | null {
  const present = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return present.length ? present.reduce((total, value) => total + value, 0) / present.length : null;
}

export function range(values: Array<number | null | undefined>): { min: number | null; max: number | null } {
  const present = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return { min: present.length ? Math.min(...present) : null, max: present.length ? Math.max(...present) : null };
}

export function readingsInPeriod(readings: TelemetryReading[], start: number, end: number): TelemetryReading[] {
  return readings.filter((reading) => reading.timestamp >= start && reading.timestamp < end);
}