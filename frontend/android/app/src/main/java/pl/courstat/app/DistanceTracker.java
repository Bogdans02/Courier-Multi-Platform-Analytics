package pl.courstat.app;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Suma kilometrów jednej zmiany, liczona z kolejnych punktów GPS wzorem Haversine.
 * Jedno konto i zmiana = jeden wpis; każdy punkt jest zapisywany od razu, więc
 * dystans przeżywa restart usługi albo uśpienie telefonu. Metry trzymamy jako liczbę
 * całkowitą, żeby nie gubić groszy odległości przy wielu dodawaniach.
 */
final class DistanceTracker {
    private static final double EARTH_RADIUS_M = 6371000.0;
    // Słabe fiksy (duży błąd) i mikro-ruchy w miejscu tylko by zawyżały dystans.
    private static final float MAX_ACCURACY_M = 50f;
    private static final double MIN_STEP_M = 10.0;

    private final SharedPreferences preferences;
    private final String metersKey;
    private final String latKey;
    private final String lngKey;
    private final String fixKey;

    DistanceTracker(Context context, int userId, int shiftId) {
        this(context.getSharedPreferences("gps_distance", Context.MODE_PRIVATE), userId, shiftId);
    }

    DistanceTracker(SharedPreferences preferences, int userId, int shiftId) {
        this.preferences = preferences;
        String base = userId + ":" + shiftId;
        metersKey = base + ":meters";
        latKey = base + ":lat";
        lngKey = base + ":lng";
        fixKey = base + ":fix";
    }

    /** Dodaje odcinek od ostatniego punktu do nowego i zwraca aktualną sumę w metrach. */
    long add(double lat, double lng, float accuracy) {
        long meters = preferences.getLong(metersKey, 0);
        if (accuracy > MAX_ACCURACY_M) return meters;
        boolean hadFix = preferences.getBoolean(fixKey, false);
        if (hadFix) {
            double previousLat = Double.longBitsToDouble(preferences.getLong(latKey, 0));
            double previousLng = Double.longBitsToDouble(preferences.getLong(lngKey, 0));
            double step = haversine(previousLat, previousLng, lat, lng);
            // Krótkie skoki poniżej progu to szum stojącego telefonu — pomijamy je.
            if (step >= MIN_STEP_M) meters += Math.round(step);
        }
        SharedPreferences.Editor editor = preferences.edit()
            .putLong(metersKey, meters)
            .putLong(latKey, Double.doubleToRawLongBits(lat))
            .putLong(lngKey, Double.doubleToRawLongBits(lng))
            .putBoolean(fixKey, true);
        if (!editor.commit()) throw new IllegalStateException("Nie udało się zapisać dystansu GPS.");
        return meters;
    }

    long meters() { return preferences.getLong(metersKey, 0); }

    boolean hadFix() { return preferences.getBoolean(fixKey, false); }

    void clear() {
        preferences.edit().remove(metersKey).remove(latKey).remove(lngKey).remove(fixKey).commit();
    }

    /** Odległość po kuli ziemskiej między dwoma punktami w metrach. */
    static double haversine(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
            + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
            * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
}
