package com.soberwatch.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Environment;
import android.provider.Settings;
import android.net.Uri;
import android.os.Build;
import android.telephony.TelephonyManager;
import android.telecom.TelecomManager;
import android.telecom.PhoneAccountHandle;
import android.text.TextUtils;
import androidx.core.content.FileProvider;
import java.io.File;
import java.text.DateFormat;
import java.util.Date;
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
        ),
        @Permission(
            strings = { Manifest.permission.CAMERA },
            alias = "camera"
        )
    }
)
public class SoberWatchEmergencyPlugin extends Plugin {

    private static final String CALL_PHONE_ALIAS = "callPhone";
    private static final String AUDIO_ALIAS = "audio";

    @PluginMethod
    public void startMonitoring(PluginCall call) {
        Context context = getContext();
        boolean shareLocation = call.getBoolean("locationSharingEnabled", true);
        if (!hasRequiredMonitoringHardware(context)) {
            call.reject("This device has no accelerometer and gyroscope; accident monitoring cannot start");
            return;
        }
        if (shareLocation && !hasLocationPermission(context)) {
            call.reject("Location permission is required when location sharing is enabled");
            return;
        }
        Intent serviceIntent = new Intent(getContext(), SoberWatchMonitoringService.class);
        serviceIntent.putExtra("sensitivity", call.getString("sensitivity", "medium"));
        serviceIntent.putExtra("locationSharingEnabled", shareLocation);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(serviceIntent);
        } else {
            getContext().startService(serviceIntent);
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("mode", "ANDROID_FOREGROUND_SERVICE");
        ret.put("message", "Native accelerometer and gyroscope monitoring started");
        call.resolve(ret);
    }

    private boolean hasLocationPermission(Context context) {
        return ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasRequiredMonitoringHardware(Context context) {
        android.hardware.SensorManager sensors = (android.hardware.SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
        return sensors != null
            && sensors.getDefaultSensor(android.hardware.Sensor.TYPE_ACCELEROMETER) != null
            && sensors.getDefaultSensor(android.hardware.Sensor.TYPE_GYROSCOPE) != null;
    }

    @PluginMethod
    public void stopMonitoring(PluginCall call) {
        getContext().stopService(new Intent(getContext(), SoberWatchMonitoringService.class));
        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("message", "Native accident monitoring stopped");
        call.resolve(ret);
    }

    @PluginMethod
    public void checkSensorSupport(PluginCall call) {
        android.hardware.SensorManager sensors = (android.hardware.SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        JSObject ret = new JSObject();
        ret.put("accelerometer", sensors != null && sensors.getDefaultSensor(android.hardware.Sensor.TYPE_ACCELEROMETER) != null);
        ret.put("gyroscope", sensors != null && sensors.getDefaultSensor(android.hardware.Sensor.TYPE_GYROSCOPE) != null);
        ret.put("location", getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_LOCATION_GPS));
        ret.put("camera", getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY));
        ret.put("microphone", getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_MICROPHONE));
        ret.put("isNativeAndroid", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void getPendingAccident(PluginCall call) {
        android.content.SharedPreferences prefs = getContext().getSharedPreferences("soberwatch_monitoring", Context.MODE_PRIVATE);
        JSObject ret = new JSObject();
        boolean detected = prefs.getBoolean("pending_accident", false);
        ret.put("detected", detected);
        if (detected) {
            ret.put("timestamp", prefs.getLong("timestamp", 0));
            ret.put("latitude", Double.longBitsToDouble(prefs.getLong("latitude_bits", Double.doubleToLongBits(0))));
            ret.put("longitude", Double.longBitsToDouble(prefs.getLong("longitude_bits", Double.doubleToLongBits(0))));
            ret.put("accuracy", prefs.getFloat("accuracy", 0));
            ret.put("confidence", prefs.getFloat("confidence", 0));
            ret.put("reason", prefs.getString("reason", "Multiple motion signals"));
            prefs.edit().putBoolean("pending_accident", false).apply();
        }
        call.resolve(ret);
    }

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
        boolean hasVoiceRadio = tm != null && tm.getPhoneType() != TelephonyManager.PHONE_TYPE_NONE;

        ret.put("hasTelephony", hasTelephony);
        ret.put("hasMicrophone", hasMicrophone);
        ret.put("hasCallPermission", hasCallPermission);
        ret.put("hasAudioPermission", hasAudioPermission);
        ret.put("hasSim", hasSim);
        ret.put("hasVoiceRadio", hasVoiceRadio);
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
        String simPreference = call.getString("simPreference", "AUTOMATIC");

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

        TelephonyManager tm = (TelephonyManager) getContext().getSystemService(Context.TELEPHONY_SERVICE);
        if (tm == null || tm.getSimState() != TelephonyManager.SIM_STATE_READY) {
            call.reject("No ready SIM is available for a direct call; use the dialer or another device");
            return;
        }
        executeActionCall(phoneNumber, simPreference, call);
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("callPhone", permissionState(Manifest.permission.CALL_PHONE));
        ret.put("location", hasLocationPermission(getContext()) ? "granted" : permissionState(Manifest.permission.ACCESS_FINE_LOCATION));
        ret.put("audio", permissionState(Manifest.permission.RECORD_AUDIO));
        ret.put("camera", permissionState(Manifest.permission.CAMERA));
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        requestPermissionForAliases(new String[] { CALL_PHONE_ALIAS, "location", AUDIO_ALIAS, "camera" }, call, "permissionsCallback");
    }

    @PermissionCallback
    private void permissionsCallback(PluginCall call) {
        checkPermissions(call);
    }

    private String permissionState(String permission) {
        return ActivityCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED ? "granted" : "denied";
    }

    /**
     * Captures a user-confirmed still using ACTION_IMAGE_CAPTURE. Android intentionally
     * blocks silent/background camera capture; this method must be invoked while the app
     * is visible and the user must approve the runtime camera permission and camera UI.
     */
    @PluginMethod
    public void captureEvidence(PluginCall call) {
        if (!getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)) {
            call.reject("No camera feature is available on this device");
            return;
        }
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "cameraPermissionCallback");
            return;
        }
        launchCamera(call);
    }

    @PermissionCallback
    private void cameraPermissionCallback(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) launchCamera(call);
        else call.reject("Camera permission was denied; evidence capture requires explicit user approval");
    }

    private void launchCamera(PluginCall call) {
        try {
            File photo = File.createTempFile("soberwatch-evidence-", ".jpg", getContext().getExternalCacheDir());
            Uri output = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", photo);
            Intent intent = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, output);
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (intent.resolveActivity(getContext().getPackageManager()) == null) {
                call.reject("No compatible camera application is installed");
                return;
            }
            savePendingCapture(output.toString());
            startActivityForResult(call, intent, "cameraResult");
        } catch (Exception e) {
            call.reject("Unable to prepare secure camera output: " + e.getMessage(), e);
        }
    }

    private void savePendingCapture(String uri) {
        getContext().getSharedPreferences("soberwatch_monitoring", Context.MODE_PRIVATE)
            .edit().putString("pending_evidence_uri", uri).apply();
    }

    @com.getcapacitor.annotation.ActivityCallback
    private void cameraResult(PluginCall call, androidx.activity.result.ActivityResult result) {
        String uri = getContext().getSharedPreferences("soberwatch_monitoring", Context.MODE_PRIVATE)
            .getString("pending_evidence_uri", "");
        if (result.getResultCode() == android.app.Activity.RESULT_OK && !TextUtils.isEmpty(uri)) {
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("uri", uri);
            ret.put("message", "Evidence captured with the system camera after user confirmation");
            call.resolve(ret);
        } else {
            call.reject("Camera capture was cancelled or did not produce an image");
        }
    }

    @PluginMethod
    public void shareIncident(PluginCall call) {
        Double latitude = call.getDouble("latitude");
        Double longitude = call.getDouble("longitude");
        String phoneNumber = call.getString("phoneNumber", "");
        long timestamp = call.getLong("timestamp", System.currentTimeMillis());
        String map = latitude != null && longitude != null ? "https://maps.google.com/?q=" + latitude + "," + longitude : "Location unavailable";
        String text = "SoberWatch incident\nTime: " + DateFormat.getDateTimeInstance().format(new Date(timestamp))
            + "\nCoordinates: " + (latitude == null || longitude == null ? "unavailable" : latitude + ", " + longitude)
            + "\nMap: " + map;
        Intent share;
        if (!TextUtils.isEmpty(phoneNumber)) {
            share = new Intent(Intent.ACTION_SENDTO);
            share.setData(Uri.parse("smsto:" + Uri.encode(phoneNumber)));
            share.putExtra("sms_body", text);
        } else {
            share = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
        }
        share.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (share.resolveActivity(getContext().getPackageManager()) == null) {
            call.reject("No application is available to share incident details");
            return;
        }
        getContext().startActivity(Intent.createChooser(share, "Share incident details"));
        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("message", "Incident coordinates, timestamp, and map link sent to the Android share sheet");
        call.resolve(ret);
    }

    @PermissionCallback
    private void callPhonePermissionCallback(PluginCall call) {
        if (getPermissionState(CALL_PHONE_ALIAS) == PermissionState.GRANTED) {
            String phoneNumber = call.getString("phoneNumber");
            if (phoneNumber != null && !phoneNumber.trim().isEmpty()) {
                executeActionCall(phoneNumber.trim(), call.getString("simPreference", "AUTOMATIC"), call);
            } else {
                call.reject("Permission granted, but phone number was empty");
            }
        } else {
            call.reject("CALL_PHONE permission was denied; Android dialer confirmation is required");
        }
    }

    private void executeActionCall(String phoneNumber, String simPreference, PluginCall call) {
        try {
            Context ctx = getContext();
            if (ActivityCompat.checkSelfPermission(ctx, Manifest.permission.CALL_PHONE) != PackageManager.PERMISSION_GRANTED) {
                call.reject("CALL_PHONE permission is not granted");
                return;
            }

            Intent callIntent = new Intent(Intent.ACTION_CALL);
            callIntent.setData(Uri.parse("tel:" + Uri.encode(phoneNumber)));
            callIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            PhoneAccountHandle account = preferredPhoneAccount(simPreference);
            if (account != null) {
                callIntent.putExtra(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, account);
            }

            if (callIntent.resolveActivity(ctx.getPackageManager()) != null) {
                ctx.startActivity(callIntent);
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("mode", "ACTION_CALL");
                ret.put("phoneNumber", phoneNumber);
                ret.put("message", "Direct emergency phone call initiated via ACTION_CALL");
                call.resolve(ret);
            } else {
                call.reject("No Android telephony handler is available");
            }
        } catch (SecurityException se) {
            call.reject("Android rejected direct calling: " + se.getMessage(), se);
        } catch (Exception e) {
            call.reject("Failed to place emergency call: " + e.getMessage(), e);
        }
    }

    private PhoneAccountHandle preferredPhoneAccount(String preference) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return null;
        TelecomManager telecom = (TelecomManager) getContext().getSystemService(Context.TELECOM_SERVICE);
        if (telecom == null) return null;
        try {
            java.util.List<PhoneAccountHandle> accounts = telecom.getCallCapablePhoneAccounts();
            if (accounts == null || accounts.isEmpty()) return null;
            if ("SIM_1".equals(preference)) return accounts.get(0);
            if ("SIM_2".equals(preference)) return accounts.size() > 1 ? accounts.get(1) : accounts.get(0);
            return null;
        } catch (SecurityException ignored) {
            return null;
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
            ret.put("success", false);
            ret.put("mode", "ACTION_DIAL");
            ret.put("phoneNumber", phoneNumber);
            ret.put("isEmergencyService", isEmergencyService);
            ret.put("message", isEmergencyService
                ? "Android requires user confirmation for public emergency numbers"
                : "Android requires user confirmation because direct calling is unavailable");
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
