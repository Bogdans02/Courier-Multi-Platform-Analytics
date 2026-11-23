package pl.courstat.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.content.res.Configuration;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.core.content.ContextCompat;
import org.json.JSONException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.function.Consumer;

public class FloatingTrackingService extends Service {
    private static FloatingTrackingService instance;
    private static Runnable started;
    private static Consumer<String> failed;
    private static final String CHANNEL = "floating_orders";
    private static final String ACTION_OVERLAY = "overlay";
    private static final String ACTION_GPS = "gps";
    private static final String ACTION_STOP_OVERLAY = "stop_overlay";
    private static final String ACTION_STOP_GPS = "stop_gps";
    // GPS co ~5 s / 15 m wystarcza dla kilometrażu kuriera, a nie wyczerpuje baterii jak ciągły strumień.
    private static final long GPS_MIN_INTERVAL_MS = 5000;
    private static final float GPS_MIN_DISTANCE_M = 15f;
    private static final String[] PLATFORMS = {"glovo", "bolt_food", "uber_eats", "pyszne_pl", "wolt", "other"};
    private static final String[] LABELS = {"Glovo", "Bolt Food", "Uber Eats", "Pyszne.pl", "Wolt", "Inne"};
    private final Handler handler = new Handler(Looper.getMainLooper());
    private WindowManager windows;
    private WindowManager.LayoutParams params;
    private View overlay;
    private TrackingDraft draft;
    private DistanceTracker distance;
    private LocationManager locations;
    private LocationListener locationListener;
    private int userId, shiftId;
    private long expiresAt;
    private boolean accepting;      // overlay licznika aktywny
    private boolean gpsRunning;     // nasłuch GPS aktywny

    static void launchOverlay(Context context, int user, int shift, long expiry, Runnable success, Consumer<String> failure) {
        launch(context, ACTION_OVERLAY, user, shift, expiry, success, failure);
    }

    static void launchGps(Context context, int user, int shift, long expiry, Runnable success, Consumer<String> failure) {
        launch(context, ACTION_GPS, user, shift, expiry, success, failure);
    }

    private static void launch(Context context, String action, int user, int shift, long expiry,
                               Runnable success, Consumer<String> failure) {
        started = success;
        failed = failure;
        try {
            ContextCompat.startForegroundService(context, new Intent(context, FloatingTrackingService.class)
                .setAction(action).putExtra("userId", user).putExtra("shiftId", shift).putExtra("expiresAt", expiry));
        } catch (Exception e) { finishStart(e.getMessage()); }
    }

    private static void finishStart(String error) {
        Runnable success = started;
        Consumer<String> failure = failed;
        started = null;
        failed = null;
        if (error == null && success != null) success.run();
        else if (failure != null) failure.accept("Nie udało się uruchomić usługi zmiany: " + error);
    }

    static boolean isTracking(int user, int shift) {
        return instance != null && instance.accepting && instance.userId == user && instance.shiftId == shift
            && System.currentTimeMillis() < instance.expiresAt && Settings.canDrawOverlays(instance);
    }

    static boolean isTrackingGps(int user, int shift) {
        return instance != null && instance.gpsRunning && instance.userId == user && instance.shiftId == shift
            && System.currentTimeMillis() < instance.expiresAt;
    }

    static void stopOverlay(Context context) {
        if (instance != null) {
            instance.removeOverlay();
            instance.afterModeChange();
        }
    }

    static void stopGps(Context context) {
        if (instance != null) {
            instance.stopLocationUpdates();
            instance.afterModeChange();
        }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || intent.getAction() == null) { stopIfIdle(); return START_NOT_STICKY; }
        String action = intent.getAction();
        if (ACTION_STOP_OVERLAY.equals(action)) { removeOverlay(); afterModeChange(); return START_NOT_STICKY; }
        if (ACTION_STOP_GPS.equals(action)) { stopLocationUpdates(); afterModeChange(); return START_NOT_STICKY; }

        int newUser = intent.getIntExtra("userId", 0);
        int newShift = intent.getIntExtra("shiftId", 0);
        long newExpiry = intent.getLongExtra("expiresAt", 0);
        // startForegroundService wymaga startForeground w kilka sekund — spełniamy tę obietnicę zanim
        // cokolwiek sprawdzimy, inaczej system wyrzuca wyjątek. Gdy dane są złe, zaraz kończymy usługę.
        if (instance != this) { accepting = false; gpsRunning = false; }
        ensureForeground(action);
        try {
            if (newUser <= 0 || newShift <= 0 || newExpiry <= System.currentTimeMillis()) {
                throw new IllegalStateException("Brak ważnej sesji.");
            }
            // Oba tryby dotyczą tej samej aktywnej zmiany; zmiana konta/zmiany zeruje poprzednie tryby.
            if (instance == this && (newUser != userId || newShift != shiftId)) {
                removeOverlay();
                stopLocationUpdates();
            }
            userId = newUser;
            shiftId = newShift;
            expiresAt = newExpiry;
            instance = this;

            if (ACTION_OVERLAY.equals(action)) startOverlay();
            else if (ACTION_GPS.equals(action)) startGps();
            refreshNotification();

            handler.removeCallbacks(this::checkSession);
            handler.postDelayed(this::checkSession, Math.min(5000, expiresAt - System.currentTimeMillis()));
            finishStart(null);
        } catch (Exception e) {
            finishStart(e.getMessage());
            // Nieudany start jednego trybu nie może zabić drugiego, już działającego; bez żadnego trybu kończymy.
            instance = this;
            afterModeChange();
        }
        return START_NOT_STICKY;
    }

    private void ensureForeground(String action) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(
            new NotificationChannel(CHANNEL, "Aktywna zmiana", NotificationManager.IMPORTANCE_LOW));
        if (Build.VERSION.SDK_INT >= 34) {
            // Od Androida 14 typ usługi trzeba podać jawnie. Łączymy typy już aktywnych trybów
            // z typem uruchamianego teraz — "location" tylko gdy mamy zgodę (plugin pilnuje tego przy GPS).
            int type = 0;
            if (gpsRunning || ACTION_GPS.equals(action)) type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION;
            if (accepting || ACTION_OVERLAY.equals(action) || type == 0) type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE;
            startForeground(15, notification(), type);
        } else {
            startForeground(15, notification());
        }
    }

    private Notification notification() {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String text = gpsRunning && accepting ? "Liczę kilometry i zamówienia."
            : gpsRunning ? "Liczę kilometry zmiany."
            : accepting ? "Dotknij, aby wrócić do licznika zamówień."
            : "Zmiana trwa.";
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        return builder.setSmallIcon(R.drawable.ic_order_tracking)
            .setContentTitle("CourStat — aktywna zmiana").setContentText(text)
            .setContentIntent(open).setOngoing(true).setCategory(Notification.CATEGORY_SERVICE).build();
    }

    private void refreshNotification() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(15, notification());
    }

    // ---- Tryb GPS -------------------------------------------------------------

    private void startGps() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
            && ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            throw new IllegalStateException("Brak zgody na lokalizację.");
        }
        locations = getSystemService(LocationManager.class);
        if (locations == null || (!locations.isProviderEnabled(LocationManager.GPS_PROVIDER)
            && !locations.isProviderEnabled(LocationManager.NETWORK_PROVIDER))) {
            throw new IllegalStateException("Lokalizacja jest wyłączona w telefonie.");
        }
        distance = new DistanceTracker(this, userId, shiftId);
        locationListener = new LocationListener() {
            @Override public void onLocationChanged(Location location) {
                if (!isTrackingGps(userId, shiftId)) { stopLocationUpdates(); afterModeChange(); return; }
                try { distance.add(location.getLatitude(), location.getLongitude(), location.getAccuracy()); }
                catch (Exception ignored) { /* pojedynczy punkt można pominąć, suma zostaje */ }
            }
            // Puste nadpisania dla zgodności ze starszymi API.
            @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
            @Override public void onProviderEnabled(String provider) {}
            @Override public void onProviderDisabled(String provider) {}
        };
        String provider = locations.isProviderEnabled(LocationManager.GPS_PROVIDER)
            ? LocationManager.GPS_PROVIDER : LocationManager.NETWORK_PROVIDER;
        try {
            locations.requestLocationUpdates(provider, GPS_MIN_INTERVAL_MS, GPS_MIN_DISTANCE_M, locationListener, Looper.getMainLooper());
        } catch (SecurityException e) {
            locationListener = null;
            throw new IllegalStateException("Brak zgody na lokalizację.");
        }
        gpsRunning = true;
    }

    private void stopLocationUpdates() {
        if (locations != null && locationListener != null) {
            try { locations.removeUpdates(locationListener); } catch (Exception ignored) {}
        }
        locationListener = null;
        gpsRunning = false;
    }

    // ---- Wspólne --------------------------------------------------------------

    private void afterModeChange() {
        if (instance != this) return;
        if (!accepting && !gpsRunning) { stopIfIdle(); return; }
        refreshNotification();
    }

    private void stopIfIdle() {
        removeOverlay();
        stopLocationUpdates();
        stopSelf();
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private void checkSession() {
        // Zegar sprawdzamy regularnie: opóźnienia Handlera stają na czas uśpienia telefonu.
        // Po wybudzeniu wygasła zmiana zatrzyma oba tryby przy najbliższym sprawdzeniu.
        boolean expired = System.currentTimeMillis() >= expiresAt;
        if (expired || (accepting && !Settings.canDrawOverlays(this))) {
            if (expired) { stopIfIdle(); return; }
            removeOverlay();
            afterModeChange();
            return;
        }
        if (!accepting && !gpsRunning) { stopIfIdle(); return; }
        handler.postDelayed(this::checkSession, Math.min(5000, expiresAt - System.currentTimeMillis()));
    }

    // ---- Tryb overlay (licznik zamówień) --------------------------------------

    private void startOverlay() throws JSONException {
        if (!Settings.canDrawOverlays(this)) throw new IllegalStateException("Brak zgody na nakładkę.");
        removeOverlayView();
        draft = new TrackingDraft(this, userId, shiftId);
        draft.save(draft.read());
        windows = getSystemService(WindowManager.class);
        params = new WindowManager.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
            Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE, PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.TOP | Gravity.LEFT;
        params.x = dp(16);
        params.y = dp(140);
        accepting = true;
        showBubble();
    }

    private GradientDrawable background(boolean circle) {
        GradientDrawable result = new GradientDrawable();
        result.setColor(Color.rgb(20, 31, 50));
        result.setStroke(dp(2), Color.rgb(245, 183, 54));
        result.setCornerRadius(dp(circle ? 28 : 16));
        return result;
    }

    private void display(View view) {
        if (overlay != null) windows.removeView(overlay);
        overlay = view;
        windows.addView(overlay, params);
        overlay.post(() -> { if (overlay == view && accepting) clampPosition(); });
    }

    private void clampPosition() {
        params.x = Math.max(0, Math.min(params.x, getResources().getDisplayMetrics().widthPixels - overlay.getWidth()));
        params.y = Math.max(0, Math.min(params.y, getResources().getDisplayMetrics().heightPixels - overlay.getHeight() - dp(32)));
        windows.updateViewLayout(overlay, params);
    }

    private void showBubble() {
        TextView bubble = new TextView(this);
        bubble.setText("+1");
        bubble.setTextColor(Color.WHITE);
        bubble.setTextSize(19);
        bubble.setGravity(Gravity.CENTER);
        bubble.setContentDescription("Rozwiń licznik zamówień");
        bubble.setBackground(background(true));
        bubble.setLayoutParams(new LinearLayout.LayoutParams(dp(56), dp(56)));
        // Top-level view size is defined by WindowManager, not the child LayoutParams.
        params.width = dp(56);
        params.height = dp(56);
        bubble.setOnClickListener(v -> { if (isTracking(userId, shiftId)) showPanel(); });
        bubble.setOnTouchListener(new View.OnTouchListener() {
            float downX, downY;
            int startX, startY;
            boolean dragged;
            public boolean onTouch(View view, MotionEvent event) {
                switch (event.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        downX = event.getRawX(); downY = event.getRawY(); startX = params.x; startY = params.y; dragged = false;
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        float dx = event.getRawX() - downX, dy = event.getRawY() - downY;
                        if (Math.hypot(dx, dy) > ViewConfiguration.get(view.getContext()).getScaledTouchSlop()) dragged = true;
                        if (dragged) { params.x = startX + Math.round(dx); params.y = startY + Math.round(dy); clampPosition(); }
                        return true;
                    case MotionEvent.ACTION_UP:
                        if (!dragged) view.performClick();
                        return true;
                    case MotionEvent.ACTION_CANCEL: return true;
                    default: return false;
                }
            }
        });
        display(bubble);
    }

    private Button button(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextColor(Color.WHITE);
        button.setBackgroundTintList(ColorStateList.valueOf(Color.rgb(35, 48, 68)));
        button.setMinHeight(dp(44));
        return button;
    }

    private void showPanel() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(8), dp(8), dp(8), dp(8));
        panel.setBackground(background(false));
        for (int i = 0; i < PLATFORMS.length; i++) {
            String platform = PLATFORMS[i];
            Button add = button(LABELS[i] + "   +1");
            add.setOnClickListener(v -> record(platform));
            panel.addView(add);
        }
        Button undo = button("Cofnij ostatnie");
        try { undo.setEnabled(draft.read().length() > 0); } catch (Exception e) { undo.setEnabled(false); }
        undo.setAlpha(undo.isEnabled() ? 1f : 0.45f);
        undo.setOnClickListener(v -> record(null));
        panel.addView(undo);
        Button collapse = button("Zwiń");
        collapse.setOnClickListener(v -> showBubble());
        panel.addView(collapse);
        // Bounded panel, never a full-screen interception layer. Scroll on short landscape screens.
        android.widget.ScrollView scroll = new android.widget.ScrollView(this);
        scroll.addView(panel);
        params.width = Math.min(dp(240), getResources().getDisplayMetrics().widthPixels - dp(32));
        params.height = Math.min(dp(440), getResources().getDisplayMetrics().heightPixels - dp(80));
        display(scroll);
    }

    private void record(String platform) {
        long clicked = System.currentTimeMillis();
        if (!isTracking(userId, shiftId)) { removeOverlay(); afterModeChange(); return; }
        try {
            if (platform == null) draft.undo();
            else {
                SimpleDateFormat utc = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
                utc.setTimeZone(TimeZone.getTimeZone("UTC"));
                draft.add(platform, utc.format(new Date(clicked)));
            }
            showBubble();
        } catch (Exception e) { Toast.makeText(this, "Nie zapisano akcji. Spróbuj ponownie.", Toast.LENGTH_LONG).show(); }
    }

    private void removeOverlayView() {
        if (overlay != null && windows != null) { windows.removeView(overlay); overlay = null; }
    }

    private void removeOverlay() {
        accepting = false;
        removeOverlayView();
    }

    @Override public void onTaskRemoved(Intent rootIntent) { stopIfIdle(); }
    @Override public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        if (accepting) showBubble();
    }
    @Override public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        removeOverlay();
        stopLocationUpdates();
        if (instance == this) instance = null;
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
