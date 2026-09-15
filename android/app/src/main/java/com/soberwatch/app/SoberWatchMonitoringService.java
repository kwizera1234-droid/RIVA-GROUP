package com.soberwatch.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

public class SoberWatchMonitoringService extends Service implements SensorEventListener {
    private static final int NOTIFICATION_ID = 7101;
    private static final String CHANNEL_ID = "soberwatch_emergency_monitoring";
    private SensorManager sensorManager;
    private LocationManager locationManager;
    private Handler handler;
    private float latestAcceleration;
    private float latestGyroscope;
    private long impactAt;
    private boolean candidate;
    private boolean postImpactStillness;
    private float peakAcceleration;
    private String sensitivity = "medium";
    private boolean locationSharingEnabled = true;
    private Location lastLocation;

    @Override
    public void onCreate() {
        super.onCreate();
        handler = new Handler(Looper.getMainLooper());
        createNotificationChannel();
        sensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            sensitivity = intent.getStringExtra("sensitivity");
            if (sensitivity == null) sensitivity = "medium";
            locationSharingEnabled = intent.getBooleanExtra("locationSharingEnabled", true);
        }
        // Read options before registering providers; a restarted START_STICKY service may
        // receive a null intent and should retain the safe default (location enabled).
        startMonitoringNotification();
        registerSensors();
        requestLocationUpdates();
        return START_STICKY;
    }

    private void registerSensors() {
        if (sensorManager == null) return;
        Sensor accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        Sensor gyroscope = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE);
        if (accelerometer != null) {
            sensorManager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_GAME, 20_000);
        }
        if (gyroscope != null) {
            sensorManager.registerListener(this, gyroscope, SensorManager.SENSOR_DELAY_GAME, 20_000);
        }
    }

    private void requestLocationUpdates() {
        if (!locationSharingEnabled || locationManager == null) return;
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
                ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) return;
        try {
            locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 1f, locationListener, Looper.getMainLooper());
            locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 2000L, 2f, locationListener, Looper.getMainLooper());
        } catch (SecurityException ignored) {
            // Permission can be revoked while the service is running.
        }
    }

    private final LocationListener locationListener = new LocationListener() {
        @Override public void onLocationChanged(Location location) {
            if (lastLocation == null || location.getAccuracy() < lastLocation.getAccuracy()) lastLocation = location;
        }
    };

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() == Sensor.TYPE_ACCELEROMETER) {
            latestAcceleration = magnitude(event.values[0], event.values[1], event.values[2]);
            if (latestAcceleration > threshold()) {
                candidate = true;
                impactAt = System.currentTimeMillis();
                peakAcceleration = latestAcceleration;
            } else if (candidate && latestAcceleration < 13.5f && System.currentTimeMillis() - impactAt < 3500L) {
                postImpactStillness = true;
            }
        } else if (event.sensor.getType() == Sensor.TYPE_GYROSCOPE) {
            latestGyroscope = magnitude(event.values[0], event.values[1], event.values[2]);
            if (candidate && latestGyroscope > 2.5f && System.currentTimeMillis() - impactAt < 2000L) {
                handler.removeCallbacks(confirmCandidate);
                handler.postDelayed(confirmCandidate, 1200L);
            }
        }
    }

    private final Runnable confirmCandidate = () -> {
        boolean rotationalEvidence = latestGyroscope > 2.5f;
        if (candidate && postImpactStillness && rotationalEvidence && System.currentTimeMillis() - impactAt < 4000L) {
            recordAccidentCandidate();
        }
        candidate = false;
        postImpactStillness = false;
    };

    private float threshold() {
        if ("low".equals(sensitivity)) return 34f;
        if ("high".equals(sensitivity)) return 20f;
        return 27f;
    }

    private float magnitude(float x, float y, float z) {
        return (float) Math.sqrt((x * x) + (y * y) + (z * z));
    }

    private void recordAccidentCandidate() {
        getSharedPreferences("soberwatch_monitoring", MODE_PRIVATE).edit()
                .putBoolean("pending_accident", true)
                .putLong("timestamp", System.currentTimeMillis())
                .putLong("latitude_bits", Double.doubleToLongBits(lastLocation == null ? 0 : lastLocation.getLatitude()))
                .putLong("longitude_bits", Double.doubleToLongBits(lastLocation == null ? 0 : lastLocation.getLongitude()))
                .putFloat("accuracy", lastLocation == null ? 0 : lastLocation.getAccuracy())
                .putFloat("confidence", 0.85f)
                .putString("reason", "High acceleration followed by rotation and post-impact stillness")
                .apply();

        Intent launch = new Intent(this, MainActivity.class)
                .setAction("com.soberwatch.ACCIDENT_SUSPECTED")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 7102, launch,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(com.soberwatch.app.R.mipmap.ic_launcher)
                .setContentTitle("SoberWatch: possible accident detected")
                .setContentText("Open SoberWatch to confirm or cancel emergency response.")
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .build();
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(NOTIFICATION_ID + 1, notification);
        try {
            startActivity(launch);
        } catch (SecurityException ignored) {
            // Android may block background activity launches; the notification remains actionable.
        }
    }

    private void startMonitoringNotification() {
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(com.soberwatch.app.R.mipmap.ic_launcher)
                .setContentTitle("SoberWatch protection active")
                .setContentText("Monitoring motion sensors for serious impact evidence")
                .setOngoing(true)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .build();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Emergency monitoring", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("SoberWatch accident detection status and emergency alerts");
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(channel);
        }
    }

    @Override public void onAccuracyChanged(Sensor sensor, int accuracy) { }

    @Override
    public void onDestroy() {
        if (sensorManager != null) sensorManager.unregisterListener(this);
        if (locationManager != null) locationManager.removeUpdates(locationListener);
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}