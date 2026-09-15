import { registerPlugin } from '@capacitor/core';

export interface SoberWatchEmergencyPluginInterface {
  startMonitoring(options?: {
    sensitivity?: 'low' | 'medium' | 'high';
    locationSharingEnabled?: boolean;
  }): Promise<{ success: boolean; mode: string; message: string }>;

  stopMonitoring(): Promise<{ success: boolean; message: string }>;

  getPendingAccident(): Promise<{
    detected: boolean;
    timestamp?: number;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    confidence?: number;
    reason?: string;
  }>;

  checkSensorSupport(): Promise<{
    accelerometer: boolean;
    gyroscope: boolean;
    location: boolean;
    camera: boolean;
    microphone: boolean;
    isNativeAndroid: boolean;
  }>;

  checkCallSupport(): Promise<{
    hasTelephony: boolean;
    hasMicrophone?: boolean;
    hasCallPermission: boolean;
    hasAudioPermission?: boolean;
    hasSim: boolean;
    isNativeAndroid: boolean;
    sdkVersion: number;
  }>;

  makeEmergencyCall(options: {
    phoneNumber: string;
    useDialer?: boolean;
    simPreference?: 'SIM_1' | 'SIM_2' | 'ASK' | 'AUTOMATIC';
  }): Promise<{
    success: boolean;
    mode: 'ACTION_CALL' | 'ACTION_DIAL';
    phoneNumber: string;
    message?: string;
  }>;

  openDialer(options: {
    phoneNumber: string;
  }): Promise<{
    success: boolean;
    mode: 'ACTION_DIAL';
    phoneNumber: string;
    isEmergencyService?: boolean;
    message?: string;
  }>;

  /** Opens the user-approved system camera; silent/background capture is not supported by Android. */
  captureEvidence(): Promise<{
    success: boolean;
    uri?: string;
    message?: string;
  }>;

  shareIncident(options: {
    phoneNumber?: string;
    latitude?: number;
    longitude?: number;
    timestamp?: number;
  }): Promise<{ success: boolean; message: string }>;

  requestPermissions?(permissions?: { permissions: string[] }): Promise<{
    callPhone: 'granted' | 'denied' | 'prompt';
    location: 'granted' | 'denied' | 'prompt';
    audio?: 'granted' | 'denied' | 'prompt';
  }>;

  checkPermissions?(): Promise<{
    callPhone: 'granted' | 'denied' | 'prompt';
    location: 'granted' | 'denied' | 'prompt';
    audio?: 'granted' | 'denied' | 'prompt';
  }>;
}

// Register the custom Capacitor native plugin with fallback
export const SoberWatchEmergency = registerPlugin<SoberWatchEmergencyPluginInterface>('SoberWatchEmergency', {
  web: () => ({
    async startMonitoring() {
      return { success: false, mode: 'WEB', message: 'Background native monitoring is unavailable in a browser' };
    },
    async stopMonitoring() {
      return { success: true, message: 'Browser monitoring stopped' };
    },
    async getPendingAccident() {
      return { detected: false };
    },
    async checkSensorSupport() {
      return {
        accelerometer: 'DeviceMotionEvent' in window,
        gyroscope: 'DeviceMotionEvent' in window,
        location: 'geolocation' in navigator,
        camera: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
        microphone: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
        isNativeAndroid: false,
      };
    },
    async checkCallSupport() {
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      return {
        hasTelephony: isMobile,
        hasMicrophone: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
        hasCallPermission: true,
        hasAudioPermission: true,
        hasSim: isMobile,
        isNativeAndroid: false,
        sdkVersion: 0,
      };
    },
    async makeEmergencyCall(options) {
      throw new Error('Automatic calling is available only on the Android device build');
    },
    async openDialer(options) {
      throw new Error('Dialer access is available only on the Android device build');
    },
    async captureEvidence() {
      throw new Error('Evidence capture is available only on Android and requires user camera confirmation');
    },
    async shareIncident() {
      throw new Error('Incident sharing is available only on the Android device build');
    },
  }),
});

/**
 * High-level helper to trigger an emergency call safely across Native Android and Web.
 */
export async function triggerNativeEmergencyCall(
  phoneNumber: string,
  forceDialer = false,
  simPreference: 'SIM_1' | 'SIM_2' | 'ASK' | 'AUTOMATIC' = 'AUTOMATIC'
): Promise<{
  success: boolean;
  mode: 'ACTION_CALL' | 'ACTION_DIAL';
  message: string;
}> {
  const cleanNumber = phoneNumber.trim();
  if (!cleanNumber) {
    throw new Error('No valid emergency phone number configured');
  }

  try {
    const result = await SoberWatchEmergency.makeEmergencyCall({
      phoneNumber: cleanNumber,
      useDialer: forceDialer,
      simPreference,
    });
    return {
      success: result.success,
      mode: result.mode,
      message: result.message || `Emergency call placed via ${result.mode}`,
    };
  } catch (err: any) {
    throw new Error(`Emergency call was not initiated: ${err?.message || 'Android rejected the request'}`);
  }
}

export async function syncNativeMonitoring(config: {
  crashDetectionEnabled: boolean;
  crashSensitivity: 'low' | 'medium' | 'high';
  locationSharingEnabled: boolean;
}) {
  try {
    if (config.crashDetectionEnabled) {
      return await SoberWatchEmergency.startMonitoring({
        sensitivity: config.crashSensitivity,
        locationSharingEnabled: config.locationSharingEnabled,
      });
    }
    return await SoberWatchEmergency.stopMonitoring();
  } catch (error) {
    console.warn('Native accident monitoring is unavailable:', error);
    return { success: false, mode: 'UNAVAILABLE', message: 'Native monitoring unavailable' };
  }
}
