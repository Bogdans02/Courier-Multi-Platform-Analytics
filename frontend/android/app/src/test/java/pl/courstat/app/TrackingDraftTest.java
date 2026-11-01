package pl.courstat.app;

import android.content.SharedPreferences;
import java.lang.reflect.Proxy;
import java.util.HashMap;
import java.util.Map;
import org.junit.Test;
import static org.junit.Assert.*;

public class TrackingDraftTest {
    // Small in-memory implementation of only the SharedPreferences operations used by the draft.
    private SharedPreferences storage(Map<String, String> values, boolean writable) {
        SharedPreferences.Editor editor = (SharedPreferences.Editor) Proxy.newProxyInstance(
            getClass().getClassLoader(), new Class[]{SharedPreferences.Editor.class}, (proxy, method, args) -> {
                switch (method.getName()) {
                    case "putString": if (writable) values.put((String) args[0], (String) args[1]); return proxy;
                    case "remove": if (writable) values.remove((String) args[0]); return proxy;
                    case "commit": return writable;
                    default: throw new UnsupportedOperationException(method.getName());
                }
            });
        return (SharedPreferences) Proxy.newProxyInstance(getClass().getClassLoader(), new Class[]{SharedPreferences.class},
            (proxy, method, args) -> {
                switch (method.getName()) {
                    case "contains": return values.containsKey(args[0]);
                    case "getString": return values.getOrDefault(args[0], (String) args[1]);
                    case "edit": return editor;
                    default: throw new UnsupportedOperationException(method.getName());
                }
            });
    }

    @Test public void clicksAndUndoPersistImmediatelyAndNeverGoBelowZero() throws Exception {
        SharedPreferences preferences = storage(new HashMap<>(), true);
        TrackingDraft draft = new TrackingDraft(preferences, 1, 12);
        draft.undo();
        assertEquals(0, draft.read().length());
        draft.add("glovo", "2026-11-01T10:00:00.000Z");
        draft.add("wolt", "2026-11-01T10:01:00.000Z");
        assertEquals(2, new TrackingDraft(preferences, 1, 12).read().length());
        draft.undo();
        assertEquals("glovo", draft.read().getJSONObject(0).getString("platform"));
        assertEquals("2026-11-01T10:00:00.000Z", draft.read().getJSONObject(0).getString("clickedAt"));
        assertEquals(1, new TrackingDraft(preferences, 1, 12).read().length());
        draft.undo(); draft.undo();
        assertEquals(0, draft.read().length());
    }

    @Test public void draftsAreIsolatedByAccountAndShiftAndSurviveRecreation() throws Exception {
        SharedPreferences preferences = storage(new HashMap<>(), true);
        TrackingDraft first = new TrackingDraft(preferences, 1, 12);
        first.add("glovo", "2026-11-01T10:00:00.000Z");
        assertFalse(new TrackingDraft(preferences, 2, 12).exists());
        assertFalse(new TrackingDraft(preferences, 1, 13).exists());
        assertEquals(1, new TrackingDraft(preferences, 1, 12).read().length());
        first.clear();
        assertFalse(first.exists());
    }

    @Test public void failedDiskWriteIsReportedAndDoesNotAcknowledgeAClick() throws Exception {
        TrackingDraft draft = new TrackingDraft(storage(new HashMap<>(), false), 1, 12);
        assertThrows(IllegalStateException.class, () -> draft.add("wolt", "2026-11-01T10:00:00.000Z"));
        assertFalse(draft.exists());
    }
}
