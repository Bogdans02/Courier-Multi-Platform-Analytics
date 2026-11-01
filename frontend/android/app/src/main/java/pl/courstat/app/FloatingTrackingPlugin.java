package pl.courstat.app;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(name = "FloatingTracking", permissions = {
    @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
})
public class FloatingTrackingPlugin extends Plugin {
    private boolean visible;
    private PluginCall pendingStart;

    @Override protected void handleOnResume() {
        visible = true;
        if (pendingStart != null) {
            PluginCall call = pendingStart;
            pendingStart = null;
            launch(call);
        }
    }
    @Override protected void handleOnPause() { visible = false; }

    @PluginMethod public void canDrawOverlays(PluginCall call) {
        call.resolve(new JSObject().put("granted", Settings.canDrawOverlays(getContext())));
    }

    @PluginMethod public void requestOverlayPermission(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getContext().getPackageName())));
                call.resolve(); // React rechecks on focus/resume; granting never auto-starts tracking.
            } catch (Exception e) { call.reject("Nie można otworzyć ustawień nakładki.", e); }
        });
    }

    @PluginMethod public void startTracking(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") == PermissionState.PROMPT) {
            requestPermissionForAlias("notifications", call, "afterNotifications");
        } else launch(call);
    }

    @PermissionCallback private void afterNotifications(PluginCall call) {
        // Permission result can arrive before Activity.onResume. Continue the user's
        // original start only once CourStat is visible again.
        if (visible) launch(call);
        else pendingStart = call;
    }

    private void launch(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            Integer userId = call.getInt("userId"), shiftId = call.getInt("shiftId");
            Long expiresAt = call.getLong("expiresAt");
            if (!visible || !Settings.canDrawOverlays(getContext()) || userId == null || shiftId == null
                || userId <= 0 || shiftId <= 0 || expiresAt == null || expiresAt <= System.currentTimeMillis()) {
                call.reject("Uruchom licznik w widocznej aplikacji, z ważną sesją i zgodą na nakładkę.");
                return;
            }
            FloatingTrackingService.launch(getContext(), userId, shiftId, expiresAt,
                () -> call.resolve(new JSObject().put("active", true)
                    .put("notificationsGranted", NotificationManagerCompat.from(getContext()).areNotificationsEnabled())),
                message -> call.reject(message));
        });
    }

    @PluginMethod public void stopTracking(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (pendingStart != null) {
                pendingStart.reject("Uruchomienie licznika anulowane.");
                pendingStart = null;
            }
            FloatingTrackingService.stop(getContext());
            call.resolve();
        });
    }

    @PluginMethod public void getTrackingState(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                Integer userId = call.getInt("userId"), shiftId = call.getInt("shiftId");
                if (userId == null || shiftId == null) { call.reject("Brak konta lub zmiany."); return; }
                TrackingDraft draft = new TrackingDraft(getContext(), userId, shiftId);
                call.resolve(new JSObject().put("active", FloatingTrackingService.isTracking(userId, shiftId))
                    .put("notificationsGranted", NotificationManagerCompat.from(getContext()).areNotificationsEnabled())
                    .put("hasDraft", draft.exists()).put("orderEvents", new JSArray(draft.read().toString())));
            } catch (Exception e) { call.reject("Nie udało się odczytać draftu licznika.", e); }
        });
    }

    @PluginMethod public void clearTrackingDraft(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                Integer userId = call.getInt("userId"), shiftId = call.getInt("shiftId");
                if (userId == null || shiftId == null || FloatingTrackingService.isTracking(userId, shiftId)) {
                    call.reject("Nie można usunąć aktywnego draftu."); return;
                }
                new TrackingDraft(getContext(), userId, shiftId).clear();
                call.resolve();
            } catch (Exception e) { call.reject("Nie udało się usunąć draftu licznika.", e); }
        });
    }
}
