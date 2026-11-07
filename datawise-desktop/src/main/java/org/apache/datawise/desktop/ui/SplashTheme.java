package org.apache.datawise.desktop.ui;

import org.apache.datawise.desktop.prefs.DesktopChromeStore;

import java.awt.Color;
import java.util.Locale;

/**
 * Boot / chrome colors from machine-scoped {@link DesktopChromeStore} (last-write-wins).
 */
public final class SplashTheme {
    public record Colors(String editorBg, String chromeBg, String text, String primary) {
    }

    private SplashTheme() {
    }

    public static Colors resolve() {
        DesktopChromeStore.PaintSnapshot paint = DesktopChromeStore.paintSnapshot();
        return new Colors(paint.editorBg(), paint.chromeBg(), paint.text(), paint.primaryHex());
    }

    public static Color awtChromeBackground() {
        return parseHex(resolve().chromeBg());
    }

    public static Color awtPrimary() {
        return parseHex(resolve().primary());
    }

    /** Seed CEF localStorage before theme-boot so first paint matches host prefs. */
    public static String themePrefsBootstrapJs() {
        DesktopChromeStore.PaintSnapshot paint = DesktopChromeStore.paintSnapshot();
        DesktopChromeStore.Snapshot snap = DesktopChromeStore.snapshot();
        return SplashThemeInjector.paintSeedJs(paint) + SplashThemeInjector.shellPrefsSeedJs(snap);
    }

    public static String normalizeUiSkin(String value) {
        return DesktopChromeStore.normalizeUiSkin(value);
    }

    private static Color parseHex(String hex) {
        String n = hex.startsWith("#") ? hex.substring(1) : hex;
        n = n.toLowerCase(Locale.ROOT);
        return new Color(
                Integer.parseInt(n.substring(0, 2), 16),
                Integer.parseInt(n.substring(2, 4), 16),
                Integer.parseInt(n.substring(4, 6), 16)
        );
    }
}
