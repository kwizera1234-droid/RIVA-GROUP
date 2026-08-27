package com.soberwatch.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.telephony.TelephonyManager;
import androidx.core.app.ActivityCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "SoberWatchEmergency",
    permissions = {
        @Permission(
            strings = { Manifest.permission.CALL_PHONE },
            alias = "callPhone"
        ),
        @Permission(
            strings = {
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            },
            alias = "location"
        ),
        @Permission(
            strings = { Manifest.permission.RECORD_AUDIO },
            alias = "audio"
        )
    }
)
public class SoberWatchEmergencyPlugin extends Plugin {

    private static final String CALL_PHONE_ALIAS = "callPhone";
    private static final String AUDIO_ALIAS = "audio";

    /**
     * Checks whether telephony/calling and audio hardware is supported on this device.
     */
    @PluginMethod
    public void checkCallSupport(PluginCall call) {
        JSObject ret = new JSObject();
        Context ctx = getContext();

        boolean hasTelephony = ctx.getPackageManager().hasSystemFeature(PackageManager.FEATURE_TELEPHONY);
        boolean hasMicrophone = ctx.getPackageManager().hasSystemFeature(PackageManager.FEATURE_MICROPHONE);
        boolean hasCallPermission = ActivityCompat.checkSelfPermission(ctx, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED;
        boolean hasAudioPermission = ActivityCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
        
        TelephonyManager tm = (TelephonyManager) ctx.getSystemService(Context.TELEPHONY_SERVICE);
        boolean hasSim = tm != null && tm.getSimState() == TelephonyManager.SIM_STATE_READY;

        ret.put("hasTelephony", hasTelephony);
        ret.put("hasMicrophone", hasMicrophone);
        ret.put("hasCallPermission", hasCallPermission);
        ret.put("hasAudioPermission", hasAudioPermission);
        ret.put("hasSim", hasSim);
        ret.put("isNativeAndroid", true);
        ret.put("sdkVersion", Build.VERSION.SDK_INT);

        call.resolve(ret);
    }

    /**
     * Directly places an emergency phone call using ACTION_CALL if permission is granted,
     * or opens the system dialer with ACTION_DIAL if restricted or requested.
     */
    @PluginMethod
    public void makeEmergencyCall(PluginCall call) {
        String phoneNumber = call.getString("phoneNumber");
        Boolean forceDialer = call.getBoolean("useDialer", false);

        if (phoneNumber == null || phoneNumber.trim().isEmpty()) {
            call.reject("A valid emergency phone number is required");
            return;
        }

        phoneNumber = phoneNumber.trim();

        // Android restricts programmatic ACTION_CALL on standard public emergency numbers (e.g. 112, 911, 999)
        // For public emergency services, or when forceDialer is requested, use ACTION_DIAL
        boolean isPublicEmergencyNumber = isPublicEmergencyServiceNumber(phoneNumber);

        if (Boolean.TRUE.equals(forceDialer) || isPublicEmergencyNumber) {
            launchDialer(phoneNumber, call, isPublicEmergencyNumber);
            return;
        }

        // For personal configured emergency contacts: check CALL_PHONE permission
        if (getPermissionState(CALL_PHONE_ALIAS) != PermissionState.GRANTED) {
            requestPermissionForAlias(CALL_PHONE_ALIAS, call, "callPhonePermissionCallback");
            return;
        }

        executeActionCall(phoneNumber, call);
    }

    @PermissionCallback
    private void callPhonePermissionCallback(PluginCall call) {
        if (getPermissionState(CALL_PHONE_ALIAS) == PermissionState.GRANTED) {
            String phoneNumber = call.getString("phoneNumber");
            if (phoneNumber != null && !phoneNumber.trim().isEmpty()) {
                executeActionCall(phoneNumber.trim(), call);
            } else {
                call.reject("Permission granted, but phone number was empty");
            }
        } else {
            // If CALL_PHONE was denied by user, fall back to opening dialer gracefully
            String phoneNumber = call.getString("phoneNumber", "");
            if (!phoneNumber.isEmpty()) {
                launchDialer(phoneNumber, call, false);
            } else {
                call.reject("CALL_PHONE permission was denied by user");
            }
        }
    }

    private void executeActionCall(String phoneNumber, PluginCall call) {
        try {
            Context ctx = getContext();
            if (ActivityCompat.checkSelfPermission(ctx, Manifest.permission.CALL_PHONE) != PackageManager.PERMISSION_GRANTED) {
                // Fall back to dialer if check fails
                launchDialer(phoneNumber, call, false);
                return;
            }

            Intent callIntent = new Intent(Intent.ACTION_CALL);
            callIntent.setData(Uri.parse("tel:" + Uri.encode(phoneNumber)));
            callIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            if (callIntent.resolveActivity(ctx.getPackageManager()) != null) {
                ctx.startActivity(callIntent);
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("mode", "ACTION_CALL");
                ret.put("phoneNumber", phoneNumber);
                ret.put("message", "Direct emergency phone call initiated via ACTION_CALL");
                call.resolve(ret);
            } else {
                // Fallback to dialer if no direct phone app is registered
                launchDialer(phoneNumber, call, false);
            }
        } catch (SecurityException se) {
            // Security restriction triggered (e.g. emergency number restriction on ACTION_CALL)
            // Gracefully open system dialer as per Android security specifications
            launchDialer(phoneNumber, call, false);
        } catch (Exception e) {
            call.reject("Failed to place emergency call: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void openDialer(PluginCall call) {
        String phoneNumber = call.getString("phoneNumber", "");
        launchDialer(phoneNumber, call, false);
    }

    private void launchDialer(String phoneNumber, PluginCall call, boolean isEmergencyService) {
        try {
            Context ctx = getContext();
            Intent dialIntent = new Intent(Intent.ACTION_DIAL);
            if (phoneNumber != null && !phoneNumber.trim().isEmpty()) {
                dialIntent.setData(Uri.parse("tel:" + Uri.encode(phoneNumber.trim())));
            }
            dialIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            ctx.startActivity(dialIntent);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("mode", "ACTION_DIAL");
            ret.put("phoneNumber", phoneNumber);
            ret.put("isEmergencyService", isEmergencyService);
            ret.put("message", isEmergencyService 
                ? "Opening Android dialer for emergency service number per Android security guidelines" 
                : "Opening system dialer");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to open phone dialer: " + e.getMessage(), e);
        }
    }

    private boolean isPublicEmergencyServiceNumber(String number) {
        if (number == null) return false;
        String clean = number.replaceAll("[^0-9]", "");
        return clean.equals("112") || clean.equals("911") || clean.equals("999") ||
               clean.equals("912") || clean.equals("111") || clean.equals("113") ||
               clean.equals("114") || clean.equals("000");
    }
}
