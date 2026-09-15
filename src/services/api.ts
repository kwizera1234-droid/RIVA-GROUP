import { TelemetryReading } from '../types';
import { getFirebaseIdToken } from './firebase';

export const DEFAULT_BACKEND_URL = 'https://soberwatch-backend.onrender.com';

const BACKEND_URL_KEY = 'soberwatch_backend_url';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function getBackendUrl(): string {
  const stored = localStorage.getItem(BACKEND_URL_KEY) || DEFAULT_BACKEND_URL;
  return stored.trim().replace(/\/+$/, '');
}

export function setBackendUrl(url: string) {
  localStorage.setItem(BACKEND_URL_KEY, url);
}

async function authenticatedHeaders(contentType = false): Promise<Record<string, string>> {
  const token = await getFirebaseIdToken();
  return {
    Accept: 'application/json',
    ...(contentType ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token}`,
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      typeof body?.message === 'string' ? body.message : `Backend request failed (${response.status})`,
      response.status,
      typeof body?.code === 'string' ? body.code : undefined,
    );
  }
  return body as T;
}

function normalizeReading(raw: Record<string, unknown>): TelemetryReading {
  const requiredNumbers = ['alcoholBac', 'heartRateBpm', 'spo2Percent', 'tempCelsius', 'timestamp', 'deviceId'];
  for (const field of requiredNumbers) {
    if (raw[field] === undefined || raw[field] === null || raw[field] === '') {
      throw new ApiError(`Backend reading is missing ${field}`, 502, 'INVALID_READING');
    }
  }

  const status = raw.status;
  if (status !== 'SAFE' && status !== 'CAUTION' && status !== 'DANGER') {
    throw new ApiError('Backend reading has an invalid status', 502, 'INVALID_READING');
  }

  const timestamp = typeof raw.timestamp === 'string' ? Date.parse(raw.timestamp) : Number(raw.timestamp);
  if (!Number.isFinite(timestamp)) {
    throw new ApiError('Backend reading has an invalid timestamp', 502, 'INVALID_READING');
  }

  return {
    id: typeof raw.id === 'string' ? raw.id : undefined,
    alcoholBac: Number(raw.alcoholBac),
    heartRateBpm: Number(raw.heartRateBpm),
    spo2Percent: Number(raw.spo2Percent),
    tempCelsius: Number(raw.tempCelsius),
    ecgStatus: typeof raw.ecgStatus === 'string' ? raw.ecgStatus : undefined,
    sensorRaw: raw.sensorRaw === undefined ? 0 : Number(raw.sensorRaw),
    sensorResponse: raw.sensorResponse === undefined ? undefined : Number(raw.sensorResponse),
    status,
    deviceId: String(raw.deviceId),
    timestamp,
    source: typeof raw.source === 'string' ? raw.source : undefined,
  };
}

// Check Backend Health (GET / returns status)
export async function checkBackendHealth(): Promise<{ online: boolean; message?: string }> {
  const base = getBackendUrl();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${base}/`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      return { online: true };
    }
    return { online: false, message: `HTTP ${res.status}` };
  } catch (err: any) {
    return { online: false, message: err?.message || 'Offline' };
  }
}

// User Registration: POST /api/register
export async function apiRegister(email: string, password: string): Promise<{ success: boolean; uid?: string; message?: string }> {
  const base = getBackendUrl();
  try {
    const res = await fetch(`${base}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      return { success: true, uid: data.uid, message: data.message };
    }
    return { success: false, message: data.message || 'Registration failed' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Connection error' };
  }
}

// User Login: POST /api/login
export async function apiLogin(email: string, password: string): Promise<{ success: boolean; uid?: string; email?: string; message?: string }> {
  const base = getBackendUrl();
  try {
    const res = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      return { success: true, uid: data.uid, email: data.email, message: data.message };
    }
    return { success: false, message: data.message || 'Login failed' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Connection error' };
  }
}

// Fetch authenticated readings from GET /api/readings?uid=UID&limit=100.
export async function apiFetchReadings(uid: string): Promise<TelemetryReading[]> {
  if (!uid.trim()) throw new ApiError('A Firebase UID is required to fetch readings', 401, 'AUTH_REQUIRED');
  const base = getBackendUrl();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${base}/api/readings?uid=${encodeURIComponent(uid)}&limit=100`, {
      headers: await authenticatedHeaders(),
      signal: controller.signal,
    });
    const data = await parseResponse<{ readings?: unknown[] }>(response);
    if (!Array.isArray(data.readings)) throw new ApiError('Backend returned no readings array', 502, 'INVALID_RESPONSE');
    return data.readings.map((reading) => normalizeReading(reading as Record<string, unknown>));
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('Telemetry request timed out', 408, 'TIMEOUT');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Fetch the authenticated latest reading from GET /api/health?uid=UID.
export async function apiFetchHealth(uid: string): Promise<TelemetryReading> {
  if (!uid.trim()) throw new ApiError('A Firebase UID is required to fetch health data', 401, 'AUTH_REQUIRED');
  const base = getBackendUrl();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${base}/api/health?uid=${encodeURIComponent(uid)}`, {
      headers: await authenticatedHeaders(),
      signal: controller.signal,
    });
    const data = await parseResponse<{ data?: Record<string, unknown> }>(response);
    if (!data.data) throw new ApiError('Backend returned no latest reading', 404, 'NO_DATA');
    return normalizeReading(data.data);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('Health request timed out', 408, 'TIMEOUT');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Upload Telemetry to POST /uploadTelemetry
export async function apiUploadTelemetry(
  data: Partial<TelemetryReading> & { uid: string },
  apiKey?: string
): Promise<{ success: boolean; message: string }> {
  const base = getBackendUrl();
  const requiredFields: (keyof TelemetryReading)[] = [
    'alcoholBac', 'heartRateBpm', 'spo2Percent', 'tempCelsius', 'status', 'deviceId', 'timestamp',
  ];
  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null) {
      throw new ApiError(`Telemetry is missing ${field}`, 400, 'INVALID_TELEMETRY');
    }
  }

  const headers = apiKey
    ? { Accept: 'application/json', 'Content-Type': 'application/json', 'x-api-key': apiKey }
    : await authenticatedHeaders(true);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${base}/uploadTelemetry`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...data, source: data.source || 'hardware' }),
      signal: controller.signal,
    });
    const result = await parseResponse<{ message?: string }>(response);
    return { success: true, message: result.message || 'Telemetry uploaded' };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Emergency Event Logging: POST /api/emergency (with local durable storage fallback)
const EMERGENCY_HISTORY_KEY = 'soberwatch_emergency_history';

export function getLocalEmergencyHistory(): any[] {
  try {
    const saved = localStorage.getItem(EMERGENCY_HISTORY_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveLocalEmergencyEvent(event: any) {
  try {
    const history = getLocalEmergencyHistory();
    // Prepend new event and prevent duplicates
    const filtered = history.filter((e) => e.id !== event.id);
    const updated = [event, ...filtered].slice(0, 50);
    localStorage.setItem(EMERGENCY_HISTORY_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to cache emergency event locally:', e);
  }
}

export async function apiSendEmergencyEvent(payload: {
  uid: string;
  eventId?: string;
  type: string;
  severity?: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  timestamp: string;
  contact?: string;
  notes?: string;
  mapsUrl?: string;
  recognizedText?: string;
}): Promise<{ success: boolean; message: string }> {
  const base = getBackendUrl();
  if (!payload.uid.trim()) throw new ApiError('A Firebase UID is required to log an emergency', 401, 'AUTH_REQUIRED');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${base}/api/emergency`, {
      method: 'POST',
      headers: await authenticatedHeaders(true),
      body: JSON.stringify({
        uid: payload.uid,
        eventId: payload.eventId || `emg-${Date.now()}`,
        type: payload.type,
        severity: payload.severity || 'high',
        latitude: payload.latitude,
        longitude: payload.longitude,
        accuracy: payload.accuracy,
        timestamp: payload.timestamp,
        contact: payload.contact,
        mapsUrl: payload.mapsUrl,
        notes: payload.notes,
        recognizedText: payload.recognizedText,
      }),
      signal: controller.signal,
    });
    const data = await parseResponse<{ message?: string }>(res);
    return { success: true, message: data.message || 'Emergency event logged to server' };
  } finally {
    clearTimeout(timeoutId);
  }
}
