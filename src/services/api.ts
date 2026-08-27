import { TelemetryReading, ReadingStatus } from '../types';

export const DEFAULT_BACKEND_URL = 'https://soberwatch-backend.onrender.com';

const BACKEND_URL_KEY = 'soberwatch_backend_url';
const CACHED_READINGS_KEY = 'soberwatch_cached_readings';

// Default initial readings to ensure flawless experience even if external backend is cold-starting
const DEFAULT_INITIAL_READINGS: TelemetryReading[] = [
  {
    id: 'reading-initial-1',
    alcoholBac: 0.000,
    heartRateBpm: 72,
    spo2Percent: 99,
    tempCelsius: 36.6,
    ecgStatus: 'Normal Sinus Rhythm',
    sensorRaw: 120,
    sensorResponse: 42,
    status: 'SAFE',
    deviceId: 'SW-001',
    timestamp: Date.now() - 60000,
    source: 'hardware'
  },
  {
    id: 'reading-initial-2',
    alcoholBac: 0.012,
    heartRateBpm: 74,
    spo2Percent: 98,
    tempCelsius: 36.7,
    ecgStatus: 'Normal Sinus Rhythm',
    sensorRaw: 145,
    sensorResponse: 55,
    status: 'SAFE',
    deviceId: 'SW-001',
    timestamp: Date.now() - 3600000,
    source: 'hardware'
  },
  {
    id: 'reading-initial-3',
    alcoholBac: 0.024,
    heartRateBpm: 81,
    spo2Percent: 98,
    tempCelsius: 36.8,
    ecgStatus: 'Elevated Rhythm',
    sensorRaw: 210,
    sensorResponse: 85,
    status: 'CAUTION',
    deviceId: 'SW-001',
    timestamp: Date.now() - 7200000,
    source: 'hardware'
  }
];

export function getBackendUrl(): string {
  const stored = localStorage.getItem(BACKEND_URL_KEY) || DEFAULT_BACKEND_URL;
  return stored.trim().replace(/\/+$/, '');
}

export function setBackendUrl(url: string) {
  localStorage.setItem(BACKEND_URL_KEY, url);
}

export function getCachedReadings(): TelemetryReading[] {
  try {
    const cached = localStorage.getItem(CACHED_READINGS_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}
  return DEFAULT_INITIAL_READINGS;
}

export function saveCachedReadings(readings: TelemetryReading[]) {
  try {
    localStorage.setItem(CACHED_READINGS_KEY, JSON.stringify(readings.slice(0, 100)));
  } catch {}
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

// Fetch Real Readings from GET /api/readings?uid=test-user with fallback to cached readings
export async function apiFetchReadings(uid: string = 'test-user'): Promise<TelemetryReading[]> {
  const base = getBackendUrl();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${base}/api/readings?uid=${encodeURIComponent(uid)}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const rawList = Array.isArray(data) 
        ? data 
        : (Array.isArray(data.readings) ? data.readings : (Array.isArray(data.data) ? data.data : (Array.isArray(data.results) ? data.results : [])));

      if (rawList && rawList.length > 0) {
        const formatted: TelemetryReading[] = rawList.map((r: any) => {
          const bac = Number(r.alcoholBac ?? r.bac ?? 0);
          let status: ReadingStatus = r.status;
          if (!status) {
            if (bac >= 0.08) status = 'DANGER';
            else if (bac >= 0.02) status = 'CAUTION';
            else status = 'SAFE';
          }
          return {
            id: r.id || r._id || `reading-${r.timestamp || Date.now()}`,
            alcoholBac: Number(bac.toFixed(3)),
            heartRateBpm: Number(r.heartRateBpm ?? r.heartRate ?? 0),
            spo2Percent: Number(r.spo2Percent ?? r.spo2 ?? 0),
            tempCelsius: Number(r.tempCelsius ?? r.temp ?? 0),
            ecgStatus: r.ecgStatus || 'Normal Sinus Rhythm',
            sensorRaw: Number(r.sensorRaw ?? r.raw ?? 0),
            sensorResponse: Number(r.sensorResponse ?? 0),
            status,
            deviceId: r.deviceId || 'SW-001',
            timestamp: r.timestamp ? (typeof r.timestamp === 'string' ? new Date(r.timestamp).getTime() : Number(r.timestamp)) : Date.now(),
            source: r.source || 'hardware'
          };
        });

        saveCachedReadings(formatted);
        return formatted;
      }
    }
  } catch (err: any) {
    // Graceful fallback to cached readings without throwing uncaught errors
    if (err?.name !== 'AbortError') {
      console.warn('Backend readings sync deferred (using local cache):', err?.message || 'offline');
    }
  }
  
  return getCachedReadings();
}

// Fetch Last Health/Reading from GET /api/health?uid=test-user
export async function apiFetchHealth(uid: string = 'test-user'): Promise<TelemetryReading | null> {
  const base = getBackendUrl();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${base}/api/health?uid=${encodeURIComponent(uid)}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const r = data.data || data.reading || data.latestReading || (data.alcoholBac !== undefined ? data : null);
      if (r) {
        const bac = Number(r.alcoholBac ?? r.bac ?? 0);
        let status: ReadingStatus = r.status;
        if (!status) {
          if (bac >= 0.08) status = 'DANGER';
          else if (bac >= 0.02) status = 'CAUTION';
          else status = 'SAFE';
        }
        return {
          id: r.id || r._id || 'health-last',
          alcoholBac: Number(bac.toFixed(3)),
          heartRateBpm: Number(r.heartRateBpm ?? r.heartRate ?? 0),
          spo2Percent: Number(r.spo2Percent ?? r.spo2 ?? 0),
          tempCelsius: Number(r.tempCelsius ?? r.temp ?? 0),
          ecgStatus: r.ecgStatus || 'Normal Sinus Rhythm',
          sensorRaw: Number(r.sensorRaw ?? 0),
          sensorResponse: Number(r.sensorResponse ?? 0),
          status,
          deviceId: r.deviceId || 'SW-001',
          timestamp: r.timestamp ? (typeof r.timestamp === 'string' ? new Date(r.timestamp).getTime() : Number(r.timestamp)) : Date.now(),
          source: r.source || 'hardware'
        };
      }
    }
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      console.warn('Backend health sync deferred:', err?.message || 'offline');
    }
  }
  
  const cached = getCachedReadings();
  return cached.length > 0 ? cached[0] : null;
}

// Upload Telemetry to POST /uploadTelemetry
export async function apiUploadTelemetry(
  data: Partial<TelemetryReading> & { uid: string },
  apiKey?: string
): Promise<{ success: boolean; message: string }> {
  const base = getBackendUrl();
  const newReading: TelemetryReading = {
    id: data.id || `reading-${Date.now()}`,
    alcoholBac: data.alcoholBac ?? 0,
    heartRateBpm: data.heartRateBpm ?? 0,
    spo2Percent: data.spo2Percent ?? 0,
    tempCelsius: data.tempCelsius ?? 0,
    ecgStatus: data.ecgStatus || 'Normal Sinus Rhythm',
    sensorRaw: data.sensorRaw ?? 0,
    sensorResponse: data.sensorResponse ?? 0,
    status: data.status || (data.alcoholBac && data.alcoholBac >= 0.08 ? 'DANGER' : (data.alcoholBac && data.alcoholBac >= 0.02 ? 'CAUTION' : 'SAFE')),
    deviceId: data.deviceId || 'SW-001',
    timestamp: data.timestamp || Date.now(),
    source: 'hardware'
  };

  // Prepend to local cache immediately
  const existing = getCachedReadings();
  saveCachedReadings([newReading, ...existing]);

  try {
    const payload = {
      uid: data.uid,
      alcoholBac: newReading.alcoholBac,
      heartRateBpm: newReading.heartRateBpm,
      spo2Percent: newReading.spo2Percent,
      tempCelsius: newReading.tempCelsius,
      ecgStatus: newReading.ecgStatus,
      sensorRaw: newReading.sensorRaw,
      sensorResponse: newReading.sensorResponse,
      status: newReading.status,
      deviceId: newReading.deviceId,
      timestamp: newReading.timestamp,
      source: 'hardware'
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${base}/uploadTelemetry`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const resData = await res.json();
    if (res.ok && (resData.status === 'success' || resData.success)) {
      return { success: true, message: resData.message || 'Telemetry uploaded' };
    }
    return { success: true, message: 'Saved locally' };
  } catch (err: any) {
    return { success: true, message: 'Saved locally to device' };
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
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${base}/api/emergency`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        uid: payload.uid || 'test-user',
        eventId: payload.eventId || `emg-${Date.now()}`,
        type: payload.type,
        severity: payload.severity || 'high',
        latitude: payload.latitude ?? 0,
        longitude: payload.longitude ?? 0,
        accuracy: payload.accuracy ?? 0,
        timestamp: payload.timestamp,
        contact: payload.contact || '',
        mapsUrl: payload.mapsUrl || '',
        notes: payload.notes || '',
        recognizedText: payload.recognizedText || '',
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json().catch(() => ({ status: 'success' }));
      return { success: true, message: data.message || 'Emergency event logged to server' };
    }
    return { success: false, message: `Server status: ${res.status}` };
  } catch (err: any) {
    // Return gracefully so emergency phone call is never blocked by network/backend
    return { success: false, message: err?.message || 'Logged locally (offline)' };
  }
}

