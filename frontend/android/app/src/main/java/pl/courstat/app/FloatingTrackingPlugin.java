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
    @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }),
    @Permission(alias = "location", strings = {
        Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION })
})
public class FloatingTrackingPlugin extends Plugin {
    private boolean visible;
    private PluginCall pendingStart;
    private PluginCall pendingGps;

    @Override protected void handleOnResume() {
        visible = true;
        if (pendingStart != null) {
            PluginCall call = pendingStart;
            pendingStart = null;
            launch(call);
        }
        if (pendingGps != null) {
            PluginCall call = pendingGps;
            pendingGps = null;
            launchGps(call);
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
            FloatingTrackingService.launchOverlay(getContext(), userId, shiftId, expiresAt,
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
            FloatingTrackingService.stopOverlay(getContext());
            call.resolve();
        });
    }

    // ---- GPS kilometrażu zmiany -----------------------------------------------

    @PluginMethod public void canUseLocation(PluginCall call) {
        call.resolve(new JSObject().put("granted", getPermissionState("location") == PermissionState.GRANTED));
    }

    @PluginMethod public void startGps(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "afterLocation");
        } else launchGps(call);
    }

    @PermissionCallback private void afterLocation(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            call.reject("Brak zgody na lokalizację. Kilometry wpiszesz ręcznie.");
            return;
        }
        // Wynik zgody może wrócić przed onResume — dokończ start dopiero gdy aplikacja jest widoczna.
        if (visible) launchGps(call);
        else pendingGps = call;
    }

    private void launchGps(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            Integer userId = call.getInt("userId"), shiftId = call.getInt("shiftId");
            Long expiresAt = call.getLong("expiresAt");
            if (getPermissionState("location") != PermissionState.GRANTED || userId == null || shiftId == null
                || userId <= 0 || shiftId <= 0 || expiresAt == null || expiresAt <= System.currentTimeMillis()) {
                call.reject("Uruchom GPS z ważną sesją i zgodą na lokalizację.");
                return;
            }
            FloatingTrackingService.launchGps(getContext(), userId, shiftId, expiresAt,
                () -> call.resolve(new JSObject().put("active", true)),
                message -> call.reject(message));
        });
    }

    @PluginMethod public void stopGps(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (pendingGps != null) {
                pendingGps.reject("Uruchomienie GPS anulowane.");
                pendingGps = null;
            }
            FloatingTrackingService.stopGps(getContext());
            call.resolve();
        });
    }

    @PluginMethod public void getDistance(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                Integer userId = call.getInt("userId"), shiftId = call.getInt("shiftId");
                if (userId == null || shiftId == null) { call.reject("Brak konta lub zmiany."); return; }
                DistanceTracker tracker = new DistanceTracker(getContext(), userId, shiftId);
                call.resolve(new JSObject().put("meters", tracker.meters()).put("hadFix", tracker.hadFix())
                    .put("active", FloatingTrackingService.isTrackingGps(userId, shiftId)));
            } catch (Exception e) { call.reject("Nie udało się odczytać dystansu GPS.", e); }
        });
    }

    @PluginMethod public void clearDistance(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                Integer userId = call.getInt("userId"), shiftId = call.getInt("shiftId");
                if (userId == null || shiftId == null || FloatingTrackingService.isTrackingGps(userId, shiftId)) {
                    call.reject("Nie można usunąć aktywnego dystansu."); return;
                }
                new DistanceTracker(getContext(), userId, shiftId).clear();
                call.resolve();
            } catch (Exception e) { call.reject("Nie udało się usunąć dystansu GPS.", e); }
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
