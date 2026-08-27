import { registerPlugin } from '@capacitor/core';

export interface SoberWatchEmergencyPluginInterface {
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
      // In browser / web environment fallback, launch standard tel protocol
      const cleanNumber = (options.phoneNumber || '').trim();
      if (!cleanNumber) {
        throw new Error('Phone number is required');
      }
      try {
        const link = document.createElement('a');
        link.href = `tel:${encodeURIComponent(cleanNumber)}`;
        link.setAttribute('target', '_top');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch {
        window.location.href = `tel:${encodeURIComponent(cleanNumber)}`;
      }
      return {
        success: true,
        mode: 'ACTION_DIAL',
        phoneNumber: cleanNumber,
        message: 'Dispatched via browser tel handler',
      };
    },
    async openDialer(options) {
      const cleanNumber = (options.phoneNumber || '').trim();
      try {
        const link = document.createElement('a');
        link.href = `tel:${encodeURIComponent(cleanNumber)}`;
        link.setAttribute('target', '_top');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch {
        window.location.href = `tel:${encodeURIComponent(cleanNumber)}`;
      }
      return {
        success: true,
        mode: 'ACTION_DIAL',
        phoneNumber: cleanNumber,
        message: 'Opened browser dialer',
      };
    },
  }),
});

/**
 * High-level helper to trigger an emergency call safely across Native Android and Web.
 */
export async function triggerNativeEmergencyCall(
  phoneNumber: string,
  isTestingMode = false,
  forceDialer = false
): Promise<{
  success: boolean;
  mode: 'ACTION_CALL' | 'ACTION_DIAL' | 'TEST_SIMULATED' | 'WEB_TEL';
  message: string;
}> {
  const cleanNumber = phoneNumber.trim();
  if (!cleanNumber) {
    throw new Error('No valid emergency phone number configured');
  }

  if (isTestingMode) {
    console.info(`[TEST MODE] Emergency call simulated to ${cleanNumber}`);
    return {
      success: true,
      mode: 'TEST_SIMULATED',
      message: `[TEST MODE] Simulated emergency call to ${cleanNumber}`,
    };
  }

  try {
    const result = await SoberWatchEmergency.makeEmergencyCall({
      phoneNumber: cleanNumber,
      useDialer: forceDialer,
    });
    return {
      success: result.success,
      mode: result.mode,
      message: result.message || `Emergency call placed via ${result.mode}`,
    };
  } catch (err: any) {
    console.warn('Native calling failed, attempting browser tel fallback:', err);
    try {
      window.location.href = `tel:${encodeURIComponent(cleanNumber)}`;
      return {
        success: true,
        mode: 'WEB_TEL',
        message: 'Fallback to browser tel link',
      };
    } catch (fallbackErr: any) {
      throw new Error(`Failed to place emergency call: ${err?.message || fallbackErr?.message || 'Unknown error'}`);
    }
  }
}
