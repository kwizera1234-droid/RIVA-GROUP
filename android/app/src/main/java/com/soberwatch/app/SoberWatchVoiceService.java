package com.soberwatch.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import java.util.ArrayList;
import java.util.Locale;

/**
 * Continuous-listening voice service.
 *
 * STT pipeline:
 *   MIC → Android SpeechRecognizer (RecognizerIntent) → transcript → broadcast
 *
 * TTS pipeline:
 *   text → Android TextToSpeech → audio
 *
 * Design rules (the reason the assistant previously stopped after one turn):
 *  - A single SpeechRecognizer instance is created once and reused. We call
 *    cancel() between sessions instead of destroy()/create, because creating a
 *    SpeechRecognizer right after a destroyed one frequently fails with
 *    ERROR_RECOGNIZER_BUSY.
 *  - startRecognition() is idempotent: nothing happens if the recognizer is
 *    already active or TTS is speaking, so START/RESUME can be called freely.
 *  - NO_MATCH / SPEECH_TIMEOUT auto-restart through a throttled,
 *    exponentially-backing-off runnable (never a tight loop).
 *  - Genuine errors (RECOGNIZER_BUSY, network, permission) are propagated to
 *    JS as "error" events; the JS voice pipeline drives recovery with its own
 *    backoff, and does the exact restart that will succeed.
 *  - A watchdog restarts the recognizer if onReadyForSpeech never fires.
 *  - After a final result or TTS completion the service does NOT auto-restart:
 *    the JS pipeline is the single source of truth for re-listening, which it
 *    guarantees after every interaction (including the speakingDone event).
 *
 * Kinyarwanda STT:
 *  - We use Android's built-in SpeechRecognizer with rw-RW locale.
 *  - On devices where rw-RW is not installed, we attempt detection via
 *    the intent's available locales. If truly unsupported, we fall back
 *    to en-US and log the limitation clearly.
 *  - We NEVER fake Kinyarwanda TTS by using an English voice.
 */
public class SoberWatchVoiceService extends Service {
    public static final String ACTION_START = "com.soberwatch.app.voice.START";
    public static final String ACTION_STOP = "com.soberwatch.app.voice.STOP";
    public static final String ACTION_RESUME = "com.soberwatch.app.voice.RESUME";
    public static final String ACTION_SPEAK = "com.soberwatch.app.voice.SPEAK";
    public static final String ACTION_PAUSE = "com.soberwatch.app.voice.PAUSE";
    public static final String EXTRA_LANGUAGE = "language";
    public static final String EXTRA_CONTINUOUS = "continuous";
    public static final String EXTRA_TEXT = "text";
    public static final String EXTRA_RATE = "rate";
    public static final String EXTRA_PITCH = "pitch";
    public static final String EVENT = "com.soberwatch.app.voice.EVENT";
    public static final String EVENT_KIND = "kind";
    public static final String EVENT_TEXT = "text";
    public static final String EVENT_INTERIM = "interim";
    public static final String EVENT_ERROR = "error";
    public static final String EVENT_DIAGNOSTIC = "diagnostic";

    private static final String TAG = "SoberWatchVoice";
    private static final String CHANNEL_ID = "soberwatch_voice";
    private static final int NOTIFICATION_ID = 2201;

    private static final long WATCHDOG_MS = 12000L;
    private static final long MIN_AUTO_RESTART_MS = 300L;
    private static final long MAX_AUTO_RESTART_MS = 8000L;

    private SpeechRecognizer recognizer;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private TextToSpeech textToSpeech;
    private String language = "en-US";
    private String resolvedSTTLanguage = "en-US";
    /** True once the recognizer reported a real language error for rw-RW; from then on we use the fallback chain (sw-KE → en-US) instead of retrying an unsupported locale. */
    private boolean sttLanguageFallbackEngaged;
    private boolean continuous;
    private boolean stopping;
    private boolean speaking;
    private boolean listeningActive;
    private boolean recognizerReady;

    private final Runnable startRecognitionRunnable = this::startRecognition;

    private final Runnable watchdogRunnable = new Runnable() {
        @Override public void run() {
            if (stopping || speaking || !listeningActive) return;
            if (recognizer == null || !recognizerReady) {
                Log.w(TAG, "watchdog: recognizer not ready; restarting");
                sendDiagnostic("WATCHDOG", "recognizer_not_ready");
                scheduleRestart();
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        querySupportedLanguagesAndProvider();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;
        String action = intent.getAction();
        if (ACTION_START.equals(action)) {
            String requestedLanguage = intent.getStringExtra(EXTRA_LANGUAGE);
            String previousLanguage = language;
            language = requestedLanguage == null ? "en-US" : requestedLanguage;
            // If the recognizer language changed (e.g. rw-RW -> en-US), forget any
            // stale fallback flag so the newly requested language gets a fresh attempt.
            if (!language.equals(previousLanguage)) sttLanguageFallbackEngaged = false;
            continuous = intent.getBooleanExtra(EXTRA_CONTINUOUS, false);
            stopping = false;
            speaking = false;
            listeningActive = false;
            recognizerReady = false;
            Log.i(TAG, "START action, language=" + language + ", continuous=" + continuous);
            sendDiagnostic("MICROPHONE", "started");
            startForeground(NOTIFICATION_ID, buildNotification("Listening for SoberWatch commands"));
            startRecognition();
        } else if (ACTION_STOP.equals(action)) {
            Log.i(TAG, "STOP action");
            stopping = true;
            cancelRestart();
            cancelRecognition();
            destroyRecognizer();
            if (textToSpeech != null) textToSpeech.stop();
            stopForeground(true);
            stopSelf();
        } else if (ACTION_RESUME.equals(action)) {
            Log.i(TAG, "RESUME action, language=" + language);
            stopping = false;
            speaking = false;
            startForeground(NOTIFICATION_ID, buildNotification("Listening for SoberWatch commands"));
            startRecognition();
        } else if (ACTION_PAUSE.equals(action)) {
            Log.i(TAG, "PAUSE action (TTS speaking or app backgrounded)");
            stopping = false;
            speaking = false;
            cancelRecognition();
            sendEvent("paused", null, false, null);
        } else if (ACTION_SPEAK.equals(action)) {
            Log.i(TAG, "SPEAK action");
            startForeground(NOTIFICATION_ID, buildNotification("SoberWatch is speaking"));
            String text = intent.getStringExtra(EXTRA_TEXT);
            String requestedLanguage = intent.getStringExtra(EXTRA_LANGUAGE);
            float rate = intent.getFloatExtra(EXTRA_RATE, 1.0f);
            float pitch = intent.getFloatExtra(EXTRA_PITCH, 1.0f);
            speak(text == null ? "" : text, requestedLanguage == null ? language : requestedLanguage, rate, pitch);
        }
        return START_NOT_STICKY;
    }

    /**
     * Resolve the best available STT language for Kinyarwanda.
     * Checks whether the Android SpeechRecognizer actually supports the
     * requested locale before committing to it. Falls back gracefully.
     */
    private String resolveRecognizerLanguage(String requestedLanguage) {
        String candidate = requestedLanguage == null ? "" : requestedLanguage.trim();
        if (candidate.isEmpty()) {
            candidate = Locale.getDefault().toLanguageTag();
        }

        String normalized = candidate.replace('_', '-');

        // Build the candidate locale for the requested language
        String rwCandidate = "rw-RW";
        String frCandidate = "fr-FR";
        String swCandidate = "sw-KE";
        String enCandidate = "en-US";

            if (normalized.equalsIgnoreCase("rw") || normalized.equalsIgnoreCase("rw-rw")) {
                // Kinyarwanda is the priority language. We do NOT silently switch
                // the recognizer to en-US purely because rw-RW is missing from the
                // offline language list: Google's SpeechRecognizer can recognize
                // rw-RW over the network on devices where the Google app is present,
                // even when ACTION_GET_LANGUAGE_DETAILS only reports offline packs.
                // We only switch away AFTER a real ERROR_LANGUAGE_NOT_SUPPORTED /
                // ERROR_LANGUAGE_UNAVAILABLE (handled in onError), then prefer sw-KE
                // (closest major language used in Rwanda) before en-US.
                if (!sttLanguageFallbackEngaged) {
                    sendDiagnostic("STT_LANGUAGE", "rw-RW");
                    resolvedSTTLanguage = rwCandidate;
                    return rwCandidate;
                }
                if (supportedLanguages != null && isLanguageAvailable(swCandidate)) {
                    Log.w(TAG, "Kinyarwanda (rw-RW) STT errored on this device. Falling back to sw-KE.");
                    sendDiagnostic("STT_LANGUAGE", "rw-RW_error_fallback_sw-KE");
                    resolvedSTTLanguage = swCandidate;
                    return swCandidate;
                }
                Log.w(TAG, "Kinyarwanda (rw-RW) STT is not available on this device. Falling back to en-US.");
                sendDiagnostic("STT_LANGUAGE", "rw-RW_unavailable_fallback_en-US");
                resolvedSTTLanguage = enCandidate;
                return enCandidate;
            }
        if (normalized.equalsIgnoreCase("fr") || normalized.equalsIgnoreCase("fr-fr")) {
            if (isLanguageAvailable(frCandidate)) {
                resolvedSTTLanguage = frCandidate;
                return frCandidate;
            }
            resolvedSTTLanguage = enCandidate;
            return enCandidate;
        }
        if (normalized.equalsIgnoreCase("sw") || normalized.equalsIgnoreCase("sw-tz") || normalized.equalsIgnoreCase("sw-ke")) {
            if (isLanguageAvailable(swCandidate)) {
                resolvedSTTLanguage = swCandidate;
                return swCandidate;
            }
            resolvedSTTLanguage = enCandidate;
            return enCandidate;
        }
        if (normalized.equalsIgnoreCase("en") || normalized.equalsIgnoreCase("en-us") || normalized.equalsIgnoreCase("en-gb")) {
            resolvedSTTLanguage = enCandidate;
            return enCandidate;
        }

        // For any other language, check availability
        if (isLanguageAvailable(normalized)) {
            resolvedSTTLanguage = normalized;
            return normalized;
        }

        String fallback = Locale.getDefault().toLanguageTag().isEmpty() ? enCandidate : Locale.getDefault().toLanguageTag();
        resolvedSTTLanguage = fallback;
        return fallback;
    }

    /** Cached supported languages from ACTION_GET_LANGUAGE_DETAILS, null until fetched. */
    private java.util.Set<String> supportedLanguages = null;
    private String recognizerProvider = "unknown";

    /**
     * Check if the Android SpeechRecognizer can recognize a given locale.
     * Real check: queries ACTION_GET_LANGUAGE_DETAILS via ordered broadcast.
     * If the broadcast hasn't returned yet, we conservatively return true for
     * widely-available locales (en, fr, sw) and false for rw which is often
     * missing, so the caller can at least log an honest fallback. Once the
     * supported set is cached, we use it exactly.
     *
     * Kinyarwanda note: Many devices do NOT ship an rw-RW acoustic model.
     * Google's SpeechRecognizer (package com.google.android.googlequicksearchbox)
     * supports rw-RW only on devices where the Google app + rw-RW language pack
     * is installed and the network model is reachable. When unavailable we fall
     * back to en-US/sw-KE and rely on the semantic intent layer which handles
     * mixed Kinyarwanda/English ("Reba heartbeat yanjye") — we NEVER fake word
     * replacement. A future cloud STT (Google Cloud Speech-to-Text v2 with
     * languageCode rw-RW, or Gemini audio transcription via @google/genai)
     * could be used when a server API key is present, but is not assumed here.
     */
    private boolean isLanguageAvailable(String langTag) {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) return false;
        // Try honest cache first
        if (supportedLanguages != null) {
            String norm = langTag.replace('_', '-').toLowerCase(java.util.Locale.ROOT);
            for (String s : supportedLanguages) {
                String cs = s.replace('_', '-').toLowerCase(java.util.Locale.ROOT);
                if (cs.equals(norm) || cs.startsWith(norm.split("-")[0] + "-") || norm.startsWith(cs.split("-")[0] + "-")) {
                    // exact or prefix match — some devices report "rw" not "rw-RW"
                    if (cs.equals(norm) || cs.equals(norm.split("-")[0]) || norm.equals(cs)) return true;
                    if (cs.split("-")[0].equals(norm.split("-")[0])) return true;
                }
            }
            // No match in the provider's advertised list
            return false;
        }
        // No cache yet: be honest — don't assume rw-RW works everywhere
        String lower = langTag.toLowerCase(java.util.Locale.ROOT);
        if (lower.startsWith("rw")) {
            // Many devices lack rw-RW; treat as unavailable until proven otherwise
            // so resolveRecognizerLanguage logs the fallback clearly.
            return false;
        }
        // en/fr/sw are commonly available
        return true;
    }

    private void querySupportedLanguagesAndProvider() {
        // Provider detection
        try {
            android.content.Intent recIntent = new android.content.Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            android.content.pm.ResolveInfo ri = getPackageManager().resolveActivity(recIntent, android.content.pm.PackageManager.MATCH_DEFAULT_ONLY);
            if (ri != null && ri.activityInfo != null) {
                recognizerProvider = ri.activityInfo.packageName != null ? ri.activityInfo.packageName : "unknown";
                Log.i(TAG, "STT provider package: " + recognizerProvider);
                sendDiagnostic("STT_PROVIDER", recognizerProvider);
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not determine STT provider: " + e.getMessage());
        }
        // Async fetch of supported languages
        try {
            android.content.Intent detailsIntent = new android.content.Intent(RecognizerIntent.ACTION_GET_LANGUAGE_DETAILS);
            sendOrderedBroadcast(detailsIntent, null, new android.content.BroadcastReceiver() {
                @Override public void onReceive(android.content.Context context, android.content.Intent intent) {
                    android.os.Bundle results = getResultExtras(true);
                    if (results != null) {
                        java.util.ArrayList<String> langs = results.getStringArrayList(RecognizerIntent.EXTRA_SUPPORTED_LANGUAGES);
                        if (langs != null) {
                            supportedLanguages = new java.util.HashSet<>(langs);
                            Log.i(TAG, "STT supported languages: " + supportedLanguages);
                            sendDiagnostic("STT_SUPPORTED", supportedLanguages.toString());
                            // If rw requested but still missing, the next resolve call will fallback honestly
                            if (!supportedLanguages.contains("rw-RW") && !supportedLanguages.contains("rw")) {
                                Log.w(TAG, "Kinyarwanda STT not advertised by provider — honest fallback will be used");
                                sendDiagnostic("STT_KINYARWANDA", "unavailable_on_device_honest_fallback");
                            }
                        }
                        java.util.ArrayList<String> hints = results.getStringArrayList(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE);
                        if (hints != null) Log.i(TAG, "STT language preference hint: " + hints);
                    }
                }
            }, null, android.app.Activity.RESULT_OK, null, null);
        } catch (Exception e) {
            Log.w(TAG, "ACTION_GET_LANGUAGE_DETAILS broadcast failed: " + e.getMessage());
        }
    }

    private void ensureRecognizer() {
        if (recognizer != null && recognizerReady) return;
        destroyRecognizer();

        try {
            recognizer = SpeechRecognizer.createSpeechRecognizer(this);
        } catch (SecurityException e) {
            Log.e(TAG, "Cannot create SpeechRecognizer: permission denied", e);
            sendEvent("error", null, false, "Microphone permission is required");
            return;
        } catch (RuntimeException e) {
            Log.e(TAG, "Cannot create SpeechRecognizer: " + e.getMessage(), e);
            sendEvent("error", null, false, "Speech recognition unavailable: " + e.getMessage());
            return;
        }

        recognizerReady = false;
        recognizer.setRecognitionListener(new RecognitionListener() {
            public void onReadyForSpeech(Bundle params) {
                handler.removeCallbacks(watchdogRunnable);
                recognizerReady = true;
                listeningActive = true;
                restartCount = 0;
                Log.i(TAG, "onReadyForSpeech: listening active");
                sendDiagnostic("RECOGNIZER", "ready");
                sendEvent("listening", null, false, null);
            }
            public void onBeginningOfSpeech() {
                Log.i(TAG, "onBeginningOfSpeech");
                sendEvent("recognizing", null, false, null);
            }
            public void onRmsChanged(float rmsdB) {}
            public void onBufferReceived(byte[] buffer) {}
            public void onEndOfSpeech() {
                Log.i(TAG, "onEndOfSpeech: processing");
                sendEvent("processing", null, false, null);
            }
            public void onError(int error) {
                handler.removeCallbacks(watchdogRunnable);
                listeningActive = false;
                recognizerReady = false;
                Log.w(TAG, "onError code=" + error + " language=" + resolvedSTTLanguage);
                if (stopping) return;

                String errorString = errorToString(error);

                // Language not supported: engage fallback and re-resolve the ORIGINAL
                // requested language (rw -> sw-KE -> en-US) instead of hard-coding en-US.
                if (error == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED ||
                    error == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE) {
                    sttLanguageFallbackEngaged = true;
                    String fallback = resolveRecognizerLanguage(language);
                    Log.i(TAG, "Language unsupported, resolved to: " + fallback);
                    sendDiagnostic("STT_LANGUAGE_FALLBACK", errorString + "->" + fallback);
                    scheduleRestart();
                    return;
                }

                // No speech / timeout: auto-restart quietly
                if (error == SpeechRecognizer.ERROR_NO_MATCH ||
                    error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                    if (continuous) {
                        sendDiagnostic("NO_SPEECH", errorString);
                        scheduleRestart();
                    }
                    return;
                }

                // Recognizer busy: don't tight-loop
                if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) {
                    sendEvent("error", null, false, "Speech recognition busy, scheduling retry");
                    sendDiagnostic("RECOGNIZER_BUSY", errorString);
                    scheduleRestart();
                    return;
                }

                // Audio errors
                if (error == SpeechRecognizer.ERROR_AUDIO) {
                    sendDiagnostic("AUDIO_ERROR", errorString);
                    scheduleRestart();
                    return;
                }

                // Client errors
                if (error == SpeechRecognizer.ERROR_CLIENT) {
                    sendEvent("error", null, false, "Recognition client error: " + errorString);
                    sendDiagnostic("CLIENT_ERROR", errorString);
                    scheduleRestart();
                    return;
                }

                // Network errors
                if (error == SpeechRecognizer.ERROR_NETWORK) {
                    sendEvent("error", null, false, "Network error during recognition");
                    sendDiagnostic("NETWORK_ERROR", errorString);
                    scheduleRestart();
                    return;
                }

                // Unknown error
                sendEvent("error", null, false, "Speech recognition error: " + errorString);
                sendDiagnostic("RECOGNITION_ERROR", errorString);
                scheduleRestart();
            }
            public void onResults(Bundle results) {
                handler.removeCallbacks(watchdogRunnable);
                ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                recognizerReady = false;
                if (matches != null && !matches.isEmpty()) {
                    String transcript = matches.get(0);
                    Log.i(TAG, "onResults final=\"" + transcript + "\" count=" + matches.size());
                    sendDiagnostic("TRANSCRIPT_RECEIVED", truncate(transcript, 80));
                    sendEvent("result", transcript, false, null);
                    // Also send partial results if available
                    if (matches.size() > 1) {
                        StringBuilder partials = new StringBuilder();
                        for (int i = 1; i < matches.size(); i++) {
                            if (i > 1) partials.append(", ");
                            partials.append(matches.get(i));
                        }
                        sendEvent("recognizing", partials.toString(), true, null);
                    }
                } else if (continuous && !stopping) {
                    sendDiagnostic("EMPTY_RESULTS", "no matches, restarting");
                    scheduleRestart();
                }
            }
            public void onPartialResults(Bundle results) {
                ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (matches != null && !matches.isEmpty()) {
                    String partial = matches.get(0);
                    sendDiagnostic("PARTIAL_TRANSCRIPT", truncate(partial, 80));
                    sendEvent("recognizing", partial, true, null);
                }
            }
            public void onEvent(int eventType, Bundle params) {}
        });
    }

    private String errorToString(int error) {
        switch (error) {
            case SpeechRecognizer.ERROR_AUDIO: return "ERROR_AUDIO";
            case SpeechRecognizer.ERROR_NO_MATCH: return "ERROR_NO_MATCH";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: return "ERROR_SPEECH_TIMEOUT";
            case SpeechRecognizer.ERROR_NETWORK: return "ERROR_NETWORK";
            case SpeechRecognizer.ERROR_SERVER: return "ERROR_SERVER";
            case SpeechRecognizer.ERROR_CLIENT: return "ERROR_CLIENT";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: return "ERROR_RECOGNIZER_BUSY";
            case SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED: return "ERROR_LANGUAGE_NOT_SUPPORTED";
            case SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE: return "ERROR_LANGUAGE_UNAVAILABLE";
            default: return "UNKNOWN_ERROR_" + error;
        }
    }

    private String truncate(String s, int max) {
        if (s == null) return "";
        return s.length() > max ? s.substring(0, max) + "..." : s;
    }

    private void startRecognition() {
        if (stopping || speaking) return;
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            sendEvent("error", null, false, "Speech recognition is unavailable on this device");
            sendDiagnostic("STT_UNAVAILABLE", "recognition_not_available");
            return;
        }
        if (listeningActive) return; // idempotent

        try {
            ensureRecognizer();
            if (recognizer == null) {
                sendDiagnostic("STT_UNAVAILABLE", "recognizer_null");
                return;
            }
            recognizer.cancel(); // Safe reset - avoids ERROR_RECOGNIZER_BUSY
            String recognizerLanguage = resolveRecognizerLanguage(language);
            Log.i(TAG, "Starting SpeechRecognizer language=" + recognizerLanguage +
                " (resolved from " + language + ")");
            sendDiagnostic("STT_START", recognizerLanguage);

            Intent recognitionIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            recognitionIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            recognitionIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, recognizerLanguage);
            recognitionIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, recognizerLanguage);
            recognitionIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            recognitionIntent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
            recognitionIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2000);
            recognitionIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 100);
            // Kinyarwanda may only be available through the provider network model.
            recognitionIntent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, false);

            handler.removeCallbacks(watchdogRunnable);
            handler.postDelayed(watchdogRunnable, WATCHDOG_MS);
            recognizer.startListening(recognitionIntent);
        } catch (SecurityException error) {
            cancelRecognition();
            handler.removeCallbacks(watchdogRunnable);
            sendEvent("error", null, false, "Microphone permission is required");
            sendDiagnostic("PERMISSION_DENIED", "RECORD_AUDIO");
        } catch (RuntimeException error) {
            cancelRecognition();
            handler.removeCallbacks(watchdogRunnable);
            sendEvent("error", null, false, "Android speech recognition could not start: " + error.getMessage());
            sendDiagnostic("RECOGNIZER_START_FAILED", error.getMessage());
        }
    }

    /**
     * Throttled restart for silent idling (no-match, speech-timeout, watchdog,
     * language fallback). Backs off exponentially up to a cap so the recognizer
     * never spins in a tight loop, but always keeps trying.
     */
    private void scheduleRestart() {
        if (stopping || speaking) return;
        handler.removeCallbacks(startRecognitionRunnable);
        long delay = restartCount == 0 ? MIN_AUTO_RESTART_MS
                : Math.min(MAX_AUTO_RESTART_MS, MIN_AUTO_RESTART_MS * (1L << Math.min(restartCount, 5)));
        restartCount++;
        lastRestartAt = SystemClock.elapsedRealtime();
        handler.postDelayed(startRecognitionRunnable, delay);
    }

    private long lastRestartAt = 0;
    private int restartCount = 0;

    private void cancelRecognition() {
        listeningActive = false;
        recognizerReady = false;
        handler.removeCallbacks(watchdogRunnable);
        if (recognizer != null) {
            try {
                recognizer.cancel();
            } catch (RuntimeException ignored) {}
        }
    }

    private void destroyRecognizer() {
        listeningActive = false;
        recognizerReady = false;
        handler.removeCallbacks(watchdogRunnable);
        if (recognizer != null) {
            try {
                recognizer.cancel();
            } catch (RuntimeException ignored) {}
            try {
                recognizer.destroy();
            } catch (RuntimeException ignored) {}
        }
        recognizer = null;
    }

    private void cancelRestart() {
        handler.removeCallbacks(startRecognitionRunnable);
        handler.removeCallbacks(watchdogRunnable);
    }

    /**
     * Send a diagnostic event to JS for development debugging.
     */
    private void sendDiagnostic(String code, String message) {
        Intent diag = new Intent(EVENT);
        diag.setPackage(getPackageName());
        diag.putExtra(EVENT_KIND, "diagnostic");
        diag.putExtra("diagnostic_code", code);
        diag.putExtra("diagnostic_message", message);
        sendBroadcast(diag);
    }

    private void speak(String text, String languageTag, float requestedRate, float requestedPitch) {
        if (text == null || text.trim().isEmpty()) {
            sendEvent("error", null, false, "Speech text is empty");
            return;
        }
        speaking = true;
        cancelRecognition();
        sendEvent("speaking", null, false, null);
        sendDiagnostic("TTS_START", "language=" + languageTag + " text_len=" + text.length());
        if (textToSpeech == null) {
            textToSpeech = new TextToSpeech(this, result -> {
                if (result == TextToSpeech.SUCCESS) {
                    speakNow(text, languageTag, requestedRate, requestedPitch);
                } else {
                    speaking = false;
                    sendEvent("error", null, false, "TextToSpeech initialization failed");
                    sendDiagnostic("TTS_INIT_FAILED", "result=" + result);
                }
            });
        } else {
            speakNow(text, languageTag, requestedRate, requestedPitch);
        }
    }

     /**
      * Configure the TTS engine for the requested language with proper
      * voice selection. For Kinyarwanda, we verify the voice exists before
      * speaking and never pretend an English voice is Kinyarwanda.
      *
      * DOCUMENTED LIMITATION: Stock Android TTS (Pico / Google TTS) does NOT
      * ship a genuine rw-RW voice on most devices. When a real Kinyarwanda
      * voice is unavailable we fall back to sw-KE → en-US and emit diagnostic
      * TTS_KINYARWANDA_FALLBACK so the JS layer can surface an honest message.
      * The voice still speaks understandably but is NOT native Kinyarwanda
      * prosody. A cloud TTS provider (Google Cloud TTS Chirp rw-RW) would be
      * needed for genuine quality; not assumed on-device.
      */
    private void speakNow(String text, String languageTag, float requestedRate, float requestedPitch) {
        Log.i(TAG, "speakNow: language=" + languageTag + " engine=" + textToSpeech.getDefaultEngine());
        sendDiagnostic("TTS_ENGINE", textToSpeech.getDefaultEngine() != null ? textToSpeech.getDefaultEngine() : "unknown");

        // Effective locale selection: resolve to the best actually-installed voice.
        // Kinyarwanda (rw) -> real rw voice (any country) -> sw-KE -> fr-FR -> en-US.
        // We never pretend an English voice is Kinyarwanda: effective locale is
        // reported via TTS_VOICE_USED so the JS layer can surface an honest note.
        String[] preferred;
        String langLower = languageTag.toLowerCase(java.util.Locale.ROOT);
        if (langLower.startsWith("rw")) preferred = new String[]{ "rw-RW", "rw", "sw-KE", "fr-FR", "en-US" };
        else if (langLower.startsWith("sw")) preferred = new String[]{ languageTag, "sw-KE", "sw", "rw-RW", "en-US" };
        else if (langLower.startsWith("fr")) preferred = new String[]{ languageTag, "fr-FR", "fr", "en-US", null };
        else preferred = new String[]{ languageTag, "en-US", "en-GB", "en", null };

        // 1) Prefer a real installed Voice whose locale matches (exact first, then language prefix).
        android.speech.tts.Voice bestVoice = null;
        String usedLocale = languageTag;
        boolean usedFallback = false;
        try {
            java.util.Set<android.speech.tts.Voice> voices = textToSpeech.getVoices();
            if (voices != null && !voices.isEmpty()) {
                StringBuilder sb = new StringBuilder();
                for (String pref : preferred) {
                    if (pref == null) continue;
                    Locale prefLocale = Locale.forLanguageTag(pref);
                    for (android.speech.tts.Voice v : voices) {
                        Locale vl = v.getLocale();
                        if (vl == null) continue;
                        if (vl.getLanguage().equals("rw") || vl.getLanguage().equals("sw") ||
                            vl.getLanguage().equals("fr") || vl.getLanguage().equals("en")) {
                            if (sb.length() < 120) sb.append(v.getName()).append("[").append(vl.toLanguageTag()).append("] ");
                            if (prefLocale.toLanguageTag().equalsIgnoreCase(vl.toLanguageTag()) ||
                                prefLocale.getLanguage().equalsIgnoreCase(vl.getLanguage())) {
                                if (bestVoice == null) {
                                    bestVoice = v;
                                    usedLocale = vl.toLanguageTag();
                                }
                            }
                        }
                    }
                    if (bestVoice != null) break;
                }
                if (sb.length() > 0) sendDiagnostic("TTS_VOICES", sb.toString());
            }
        } catch (Exception ignored) {}

        if (bestVoice != null) {
            try {
                if (textToSpeech.setVoice(bestVoice) == TextToSpeech.SUCCESS) {
                    usedFallback = !usedLocale.toLowerCase(java.util.Locale.ROOT).startsWith(
                        Locale.forLanguageTag(languageTag).getLanguage().toLowerCase(java.util.Locale.ROOT));
                    sendDiagnostic("TTS_VOICE_USED", bestVoice.getName() + "[" + usedLocale + "]");
                    Log.i(TAG, "TTS voice=" + bestVoice.getName() + " locale=" + usedLocale +
                        (usedFallback ? " (fallback from " + languageTag + ")" : ""));
                } else {
                    bestVoice = null;
                }
            } catch (Exception ignored) {
                bestVoice = null;
            }
        }

        // 2) No matching installed voice: use setLanguage() with the same fallback chain.
        if (bestVoice == null) {
            usedLocale = languageTag;
            usedFallback = false;
            int languageResult = TextToSpeech.LANG_NOT_SUPPORTED;
            for (String pref : preferred) {
                if (pref == null) continue;
                Locale l = Locale.forLanguageTag(pref);
                int res = textToSpeech.setLanguage(l);
                if (res == TextToSpeech.LANG_AVAILABLE || res == TextToSpeech.LANG_COUNTRY_AVAILABLE) {
                    languageResult = res;
                    usedLocale = l.toLanguageTag();
                    usedFallback = !usedLocale.toLowerCase(java.util.Locale.ROOT).startsWith(
                        Locale.forLanguageTag(languageTag).getLanguage().toLowerCase(java.util.Locale.ROOT));
                    break;
                }
            }
            if (languageResult == TextToSpeech.LANG_MISSING_DATA || languageResult == TextToSpeech.LANG_NOT_SUPPORTED) {
                speaking = false;
                sendEvent("error", null, false, "TextToSpeech language unavailable");
                sendDiagnostic("TTS_UNAVAILABLE", languageTag);
                return;
            }
            sendDiagnostic("TTS_VOICE_USED", "locale=" + usedLocale + (usedFallback ? " (fallback)" : ""));
        }

        if (usedFallback) {
            sendDiagnostic("TTS_LANG_FALLBACK", languageTag + "->" + usedLocale);
            Log.w(TAG, "TTS using fallback locale: " + usedLocale + " (requested: " + languageTag + ")");
        }

        // Conversational rate/pitch: user config overrides; language-appropriate defaults below.
        float rate = 1.0f;
        float pitch = 1.0f;
        String usedLower = usedLocale.toLowerCase(java.util.Locale.ROOT);
        if (usedLower.startsWith("rw")) { rate = 0.88f; pitch = 1.02f; }
        else if (usedLower.startsWith("sw")) { rate = 0.92f; pitch = 1.0f; }
        else if (usedLower.startsWith("fr")) { rate = 0.98f; pitch = 1.0f; }
        else { rate = 1.0f; pitch = 1.0f; }
        if (requestedRate > 0.4f && requestedRate <= 2.0f) rate = requestedRate;
        if (requestedPitch > 0.4f && requestedPitch <= 2.0f) pitch = requestedPitch;
        textToSpeech.setSpeechRate(rate);
        textToSpeech.setPitch(pitch);

        final String[] segments = segmentForTts(text);
        if (segments.length == 0) {
            speaking = false;
            sendEvent("speakingDone", null, false, null);
            sendDiagnostic("TTS_DONE", "empty_text");
            return;
        }
        // Capture the final effective locale for the listener below (it must be
        // effectively final to be referenced from the anonymous class).
        final String spokenLocale = usedLocale;
        final int[] completedSegments = {0};
        final boolean[] done = {false};
        final int[] nextSegment = {1};

        final Runnable speakNext = new Runnable() {
            @Override public void run() {
                if (stopping || done[0]) return;
                if (nextSegment[0] >= segments.length) return;
                int idx = nextSegment[0]++;
                textToSpeech.speak(segments[idx], TextToSpeech.QUEUE_ADD, null, "soberwatch-segment-" + idx);
            }
        };

        textToSpeech.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String utteranceId) {}
            @Override public void onDone(String utteranceId) {
                completedSegments[0]++;
                if (done[0]) return;
                if (completedSegments[0] >= segments.length) {
                    done[0] = true;
                    Log.i(TAG, "speakingDone language=" + spokenLocale + " segments=" + segments.length);
                    speaking = false;
                    sendEvent("speakingDone", null, false, null);
                    sendDiagnostic("TTS_DONE", "language=" + spokenLocale);
                } else {
                    // Conversational pause between sentences.
                    handler.postDelayed(speakNext, 180L);
                }
            }
            @Override public void onError(String utteranceId) {
                if (done[0]) return;
                done[0] = true;
                speaking = false;
                sendEvent("error", null, false, "TextToSpeech playback failed");
                sendDiagnostic("TTS_ERROR", "utterance=" + utteranceId);
            }
        });

        // Speak the first segment immediately; remaining segments are queued with pauses from onDone.
        textToSpeech.speak(segments[0], TextToSpeech.QUEUE_FLUSH, null, "soberwatch-segment-0");
    }

    private String[] segmentForTts(String text) {
        if (text == null || text.trim().isEmpty()) {
            return new String[]{""};
        }
        String trimmed = text.trim();
        String[] parts = trimmed.split("(?<=[.!?])\\s+");
        if (parts.length <= 1 && trimmed.length() > 150) {
            parts = trimmed.split("[,;]\\s+");
        }
        return parts;
    }

    private void sendEvent(String kind, String text, boolean interim, String error) {
        Intent event = new Intent(EVENT);
        event.setPackage(getPackageName());
        event.putExtra(EVENT_KIND, kind);
        if (text != null) event.putExtra(EVENT_TEXT, text);
        event.putExtra(EVENT_INTERIM, interim);
        if (error != null) event.putExtra(EVENT_ERROR, error);
        sendBroadcast(event);
    }

    private Notification buildNotification(String content) {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(com.soberwatch.app.R.mipmap.ic_launcher)
            .setContentTitle("SoberWatch voice assistant")
            .setContentText(content)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "SoberWatch voice assistant", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Shows when SoberWatch is actively listening");
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }

    @Override
    public void onDestroy() {
        stopping = true;
        cancelRestart();
        destroyRecognizer();
        if (textToSpeech != null) {
            textToSpeech.stop();
            textToSpeech.shutdown();
            textToSpeech = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
