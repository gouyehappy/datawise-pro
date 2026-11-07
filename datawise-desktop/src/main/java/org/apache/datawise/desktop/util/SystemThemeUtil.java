package org.apache.datawise.desktop.util;

import java.awt.Toolkit;
import java.util.Locale;

public final class SystemThemeUtil {
    private SystemThemeUtil() {
    }

    /** Returns {@code dark} or {@code light} (best-effort). */
    public static String resolveAppearance() {
        Object mac = Toolkit.getDefaultToolkit().getDesktopProperty("apple.awt.application.appearance");
        if (mac instanceof String appearance) {
            String lower = appearance.toLowerCase(Locale.ROOT);
            if (lower.contains("dark")) {
                return "dark";
            }
            if (lower.contains("light")) {
                return "light";
            }
        }
        String prop = System.getProperty("apple.awt.application.appearance");
        if (prop != null) {
            String lower = prop.toLowerCase(Locale.ROOT);
            if (lower.contains("dark")) {
                return "dark";
            }
        }
        if (isWindowsDarkMode()) {
            return "dark";
        }
        return "light";
    }

    private static boolean isWindowsDarkMode() {
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        if (!os.contains("win")) {
            return false;
        }
        Object mode = Toolkit.getDefaultToolkit().getDesktopProperty("win.application.darkMode");
        return Boolean.TRUE.equals(mode);
    }
}
