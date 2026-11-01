package pl.courstat.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.content.res.ColorStateList;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
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
    private static final String[] PLATFORMS = {"glovo", "bolt_food", "uber_eats", "pyszne_pl", "wolt", "other"};
    private static final String[] LABELS = {"Glovo", "Bolt Food", "Uber Eats", "Pyszne.pl", "Wolt", "Inne"};
    private final Handler handler = new Handler(Looper.getMainLooper());
    private WindowManager windows;
    private WindowManager.LayoutParams params;
    private View overlay;
    private TrackingDraft draft;
    private int userId, shiftId;
    private long expiresAt;
    private boolean accepting;

    static void launch(Context context, int user, int shift, long expiry, Runnable success, Consumer<String> failure) {
        started = success;
        failed = failure;
        try {
            ContextCompat.startForegroundService(context, new Intent(context, FloatingTrackingService.class)
                .putExtra("userId", user).putExtra("shiftId", shift).putExtra("expiresAt", expiry));
        } catch (Exception e) { finishStart(e.getMessage()); }
    }

    private static void finishStart(String error) {
        Runnable success = started;
        Consumer<String> failure = failed;
        started = null;
        failed = null;
        if (error == null && success != null) success.run();
        else if (failure != null) failure.accept("Nie udało się uruchomić licznika: " + error);
    }

    static boolean isTracking(int user, int shift) {
        return instance != null && instance.accepting && instance.userId == user && instance.shiftId == shift
            && System.currentTimeMillis() < instance.expiresAt && Settings.canDrawOverlays(instance);
    }

    static void stop(Context context) {
        // Disable click listeners before resolving Stop Shift, even if destruction is delayed.
        if (instance != null) instance.removeOverlay();
        context.stopService(new Intent(context, FloatingTrackingService.class));
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) { stopSelf(); return START_NOT_STICKY; }
        removeOverlay();
        userId = intent.getIntExtra("userId", 0);
        shiftId = intent.getIntExtra("shiftId", 0);
        expiresAt = intent.getLongExtra("expiresAt", 0);
        try {
            if (userId <= 0 || shiftId <= 0 || expiresAt <= System.currentTimeMillis() || !Settings.canDrawOverlays(this)) {
                throw new IllegalStateException("Brak ważnej sesji lub zgody na nakładkę.");
            }
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(
                new NotificationChannel(CHANNEL, "Licznik zamówień", NotificationManager.IMPORTANCE_LOW));
            PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
            Notification notification = builder.setSmallIcon(R.drawable.ic_order_tracking)
                .setContentTitle("Licznik zamówień aktywny").setContentText("Dotknij, aby wrócić do CourStat.")
                .setContentIntent(open).setOngoing(true).setCategory(Notification.CATEGORY_SERVICE).build();
            if (Build.VERSION.SDK_INT >= 34) startForeground(15, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            else startForeground(15, notification);
            draft = new TrackingDraft(this, userId, shiftId);
            draft.save(draft.read());
            windows = getSystemService(WindowManager.class);
            params = new WindowManager.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
                Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE, PixelFormat.TRANSLUCENT);
            params.gravity = Gravity.TOP | Gravity.LEFT;
            params.x = dp(16);
            params.y = dp(140);
            instance = this;
            accepting = true;
            showBubble();
            handler.postDelayed(this::checkSession, Math.min(5000, expiresAt - System.currentTimeMillis()));
            finishStart(null);
        } catch (Exception e) {
            removeOverlay();
            stopSelf();
            finishStart(e.getMessage());
        }
        return START_NOT_STICKY;
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private void checkSession() {
        // Recheck wall time regularly: Handler delays pause while the phone sleeps.
        // No wake lock is needed; after waking, expired tracking stops on the next check.
        if (!isTracking(userId, shiftId)) { removeOverlay(); stopSelf(); return; }
        handler.postDelayed(this::checkSession, Math.min(5000, expiresAt - System.currentTimeMillis()));
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
        if (!isTracking(userId, shiftId)) { removeOverlay(); stopSelf(); return; }
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

    private void removeOverlay() {
        accepting = false;
        handler.removeCallbacksAndMessages(null);
        if (overlay != null && windows != null) { windows.removeView(overlay); overlay = null; }
    }

    @Override public void onTaskRemoved(Intent rootIntent) { removeOverlay(); stopSelf(); }
    @Override public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        if (accepting) showBubble();
    }
    @Override public void onDestroy() {
        removeOverlay();
        if (instance == this) instance = null;
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
