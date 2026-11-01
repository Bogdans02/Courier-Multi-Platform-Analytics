package pl.courstat.app;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** One private JSON per account and shift. Every click/undo is committed immediately. */
final class TrackingDraft {
    private final SharedPreferences preferences;
    private final String key;

    TrackingDraft(Context context, int userId, int shiftId) {
        this(context.getSharedPreferences("floating_order_drafts", Context.MODE_PRIVATE), userId, shiftId);
    }

    TrackingDraft(SharedPreferences preferences, int userId, int shiftId) {
        this.preferences = preferences;
        key = userId + ":" + shiftId;
    }

    boolean exists() { return preferences.contains(key); }

    JSONArray read() throws JSONException {
        return new JSONArray(preferences.getString(key, "[]"));
    }

    void save(JSONArray events) {
        if (!preferences.edit().putString(key, events.toString()).commit()) {
            throw new IllegalStateException("Nie udało się zapisać licznika. Spróbuj ponownie.");
        }
    }

    void add(String platform, String clickedAt) throws JSONException {
        JSONArray events = read();
        events.put(new JSONObject().put("platform", platform).put("clickedAt", clickedAt));
        save(events);
    }

    void undo() throws JSONException {
        JSONArray events = read();
        if (events.length() > 0) {
            events.remove(events.length() - 1);
            save(events);
        }
    }

    void clear() {
        if (!preferences.edit().remove(key).commit()) throw new IllegalStateException("Nie udało się usunąć draftu.");
    }
}
