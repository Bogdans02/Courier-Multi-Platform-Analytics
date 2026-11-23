package pl.courstat.app;

import android.content.SharedPreferences;
import java.lang.reflect.Proxy;
import java.util.HashMap;
import java.util.Map;
import org.junit.Test;
import static org.junit.Assert.*;

public class DistanceTrackerTest {
    // In-memory SharedPreferences obsługujący tylko operacje używane przez DistanceTracker.
    private SharedPreferences storage(Map<String, Object> values) {
        SharedPreferences.Editor editor = (SharedPreferences.Editor) Proxy.newProxyInstance(
            getClass().getClassLoader(), new Class[]{SharedPreferences.Editor.class}, (proxy, method, args) -> {
                switch (method.getName()) {
                    case "putLong": case "putBoolean": values.put((String) args[0], args[1]); return proxy;
                    case "remove": values.remove((String) args[0]); return proxy;
                    case "commit": return true;
                    default: throw new UnsupportedOperationException(method.getName());
                }
            });
        return (SharedPreferences) Proxy.newProxyInstance(getClass().getClassLoader(), new Class[]{SharedPreferences.class},
            (proxy, method, args) -> {
                switch (method.getName()) {
                    case "getLong": return values.containsKey(args[0]) ? (long) values.get(args[0]) : (long) args[1];
                    case "getBoolean": return values.containsKey(args[0]) ? (boolean) values.get(args[0]) : (boolean) args[1];
                    case "edit": return editor;
                    default: throw new UnsupportedOperationException(method.getName());
                }
            });
    }

    @Test public void haversineMatchesKnownDistanceWithinOnePercent() {
        // Dwa punkty w centrum Wrocławia to ok. 1,37 km w linii prostej.
        double meters = DistanceTracker.haversine(51.1100, 17.0320, 51.0980, 17.0365);
        assertTrue("spodziewane ~1,37 km, było " + meters, meters > 1300 && meters < 1450);
    }

    @Test public void distanceAccumulatesAcrossPointsAndSurvivesRecreation() {
        Map<String, Object> values = new HashMap<>();
        SharedPreferences preferences = storage(values);
        DistanceTracker tracker = new DistanceTracker(preferences, 1, 12);
        // Pierwszy punkt tylko zapamiętuje pozycję — nie ma jeszcze odcinka.
        assertEquals(0, tracker.add(51.1100, 17.0320, 5f));
        assertTrue(tracker.hadFix());
        long afterSecond = tracker.add(51.1110, 17.0320, 5f);
        assertTrue(afterSecond > 0);
        // Nowy obiekt czyta tę samą sumę — dystans przeżywa restart usługi.
        assertEquals(afterSecond, new DistanceTracker(preferences, 1, 12).meters());
    }

    @Test public void weakFixesAndMicroMovesDoNotInflateDistance() {
        DistanceTracker tracker = new DistanceTracker(storage(new HashMap<>()), 1, 12);
        tracker.add(51.1100, 17.0320, 5f);
        // Słaby sygnał (duży błąd) jest ignorowany.
        assertEquals(0, tracker.add(51.2000, 17.2000, 80f));
        // Mikro-ruch poniżej progu (kilka metrów stojąc w miejscu) też nie dolicza.
        assertEquals(0, tracker.add(51.11002, 17.03200, 5f));
    }

    @Test public void distanceIsIsolatedByAccountAndShift() {
        Map<String, Object> values = new HashMap<>();
        SharedPreferences preferences = storage(values);
        DistanceTracker first = new DistanceTracker(preferences, 1, 12);
        first.add(51.1100, 17.0320, 5f);
        first.add(51.1110, 17.0320, 5f);
        assertFalse(new DistanceTracker(preferences, 2, 12).hadFix());
        assertEquals(0, new DistanceTracker(preferences, 1, 13).meters());
        first.clear();
        assertEquals(0, new DistanceTracker(preferences, 1, 12).meters());
        assertFalse(new DistanceTracker(preferences, 1, 12).hadFix());
    }
}
