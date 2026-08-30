import { ReadingStatus, TelemetryReading } from '../types';
import { average, range, readingsInPeriod } from '../utils/telemetry';

export interface ReportSummary {
  readings: TelemetryReading[];
  start: number;
  end: number;
  averageBac: number | null;
  lowestBac: number | null;
  highestBac: number | null;
  averageHeartRate: number | null;
  minHeartRate: number | null;
  maxHeartRate: number | null;
  safe: number;
  caution: number;
  danger: number;
  averageSpo2: number | null;
  minSpo2: number | null;
  maxSpo2: number | null;
  averageTemperature: number | null;
  minTemperature: number | null;
  maxTemperature: number | null;
  score: number | null;
  scoreStatus: 'safe' | 'caution' | 'risk' | 'unavailable';
  scoreFactors: string[];
  positiveFactors: string[];
  riskPeriods: number;
  safePeriods: number;
  trend: 'up' | 'down' | 'stable' | 'unavailable';
  dataQuality: number | null;
  devices: string[];
  recommendations: { observation: string; why: string; action: string; priority: 'high' | 'medium' | 'low' }[];
}

export function calculateReport(readings: TelemetryReading[], start: number, end: number): ReportSummary {
  const periodReadings = readingsInPeriod(readings, start, end).filter((reading) => Number.isFinite(reading.timestamp));
  const bacRange = range(periodReadings.map((reading) => reading.alcoholBac));
  const heartRateRange = range(periodReadings.map((reading) => reading.heartRateBpm));
  const spo2Range = range(periodReadings.map((reading) => reading.spo2Percent));
  const temperatureRange = range(periodReadings.map((reading) => reading.tempCelsius));
  const distribution = periodReadings.reduce<Record<ReadingStatus, number>>((result, reading) => {
    result[reading.status] += 1;
    return result;
  }, { SAFE: 0, CAUTION: 0, DANGER: 0 });

  const riskPeriods = periodReadings.filter((reading) => reading.status !== 'SAFE').length;
  const safePeriods = periodReadings.filter((reading) => reading.status === 'SAFE').length;
  const bacValues = periodReadings.map((reading) => reading.alcoholBac).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const firstBac = bacValues[0];
  const lastBac = bacValues[bacValues.length - 1];
  const trend = bacValues.length > 1 && firstBac !== undefined && lastBac !== undefined
    ? lastBac - firstBac > 0.005 ? 'up' : lastBac - firstBac < -0.005 ? 'down' : 'stable'
    : 'unavailable';
  const score = periodReadings.length === 0 ? null : Math.max(0, Math.round(
    100 - (riskPeriods / periodReadings.length) * 45
      - (bacValues.length && Math.max(...bacValues) >= 0.08 ? 25 : bacValues.length && Math.max(...bacValues) >= 0.02 ? 10 : 0)
      - (periodReadings.filter((reading) => typeof reading.heartRateBpm === 'number' && (reading.heartRateBpm < 45 || reading.heartRateBpm > 120)).length / periodReadings.length) * 15
      - (periodReadings.filter((reading) => typeof reading.spo2Percent === 'number' && reading.spo2Percent < 95).length / periodReadings.length) * 15
  ));
  const presentFields = periodReadings.reduce((count, reading) => count + [reading.alcoholBac, reading.heartRateBpm, reading.spo2Percent, reading.tempCelsius].filter((value) => typeof value === 'number' && Number.isFinite(value)).length, 0);
  const dataQuality = periodReadings.length ? Math.round((presentFields / (periodReadings.length * 4)) * 100) : null;
  const recommendations: ReportSummary['recommendations'] = [];
  if (riskPeriods > 0) recommendations.push({ observation: 'Elevated-risk readings were recorded.', why: 'Alcohol or status thresholds can affect safe decisions.', action: 'Avoid driving during elevated readings and follow your safety plan.', priority: 'high' });
  if (dataQuality !== null && dataQuality < 75) recommendations.push({ observation: 'Some measurements are missing.', why: 'Incomplete coverage reduces confidence in trends.', action: 'Check sensor placement, connection, and battery before the next reading.', priority: 'medium' });
  if (trend === 'up') recommendations.push({ observation: 'BAC increased across the selected period.', why: 'An upward trend can indicate increasing impairment risk.', action: 'Do not drive and allow time for a new verified reading.', priority: 'high' });
  if (recommendations.length === 0) recommendations.push({ observation: 'Available readings remained within the lower-risk distribution.', why: 'Consistent coverage makes the summary more useful.', action: 'Continue regular measurements and review changes over time.', priority: 'low' });

  return {
    readings: periodReadings,
    start,
    end,
    averageBac: average(periodReadings.map((reading) => reading.alcoholBac)),
    lowestBac: bacRange.min,
    highestBac: bacRange.max,
    averageHeartRate: average(periodReadings.map((reading) => reading.heartRateBpm)),
    minHeartRate: heartRateRange.min,
    maxHeartRate: heartRateRange.max,
    safe: distribution.SAFE,
    caution: distribution.CAUTION,
    danger: distribution.DANGER,
    averageSpo2: average(periodReadings.map((reading) => reading.spo2Percent)),
    minSpo2: spo2Range.min,
    maxSpo2: spo2Range.max,
    averageTemperature: average(periodReadings.map((reading) => reading.tempCelsius)),
    minTemperature: temperatureRange.min,
    maxTemperature: temperatureRange.max,
    score,
    scoreStatus: score === null ? 'unavailable' : score >= 80 ? 'safe' : score >= 60 ? 'caution' : 'risk',
    scoreFactors: [riskPeriods > 0 ? `${riskPeriods} elevated-risk readings` : 'No elevated-risk readings', dataQuality !== null ? `${dataQuality}% measurement coverage` : 'Coverage unavailable'],
    positiveFactors: [safePeriods > 0 ? `${safePeriods} lower-risk readings` : '', trend === 'down' ? 'BAC trend decreased' : ''].filter(Boolean),
    riskPeriods,
    safePeriods,
    trend,
    dataQuality,
    devices: [...new Set(periodReadings.map((reading) => reading.deviceId).filter(Boolean))],
    recommendations,
  };
}

export const calculateDailyReport = (readings: TelemetryReading[], date = new Date()) => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return calculateReport(readings, start, start + 86400000);
};

export const calculateWeeklyReport = (readings: TelemetryReading[], date = new Date()) => {
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
  return calculateReport(readings, end - 7 * 86400000, end);
};

export const calculateMonthlyReport = (readings: TelemetryReading[], date = new Date()) => {
  const start = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime();
  return calculateReport(readings, start, end);
};