package org.apache.datawise.desktop.ui;

import com.google.gson.JsonObject;
import org.apache.datawise.desktop.prefs.DesktopChromeStore;
import org.apache.datawise.desktop.prefs.WindowStateStore;
import org.cef.browser.CefBrowser;
import org.cef.handler.CefKeyboardHandler;
import org.cef.misc.EventFlags;

import java.awt.event.KeyEvent;

/** Page zoom helpers for the embedded CEF browser (Chromium zoom levels). */
public final class DesktopBrowserZoom {
    public static final double STEP = 0.5;
    public static final double MIN = -5.0;
    public static final double MAX = 5.0;

    /** Not a zoom shortcut. */
    public static final int NONE = 0;
    /** Reset to 100%. */
    public static final int RESET = 1;
    public static final int IN = 2;
    public static final int OUT = 3;

    private DesktopBrowserZoom() {
    }

    public static void zoomIn(CefBrowser browser) {
        adjust(browser, STEP);
    }

    public static void zoomOut(CefBrowser browser) {
        adjust(browser, -STEP);
    }

    public static void zoomReset(CefBrowser browser) {
        if (browser != null) {
            browser.setZoomLevel(0.0);
            persistZoom(0.0);
        }
    }

    public static void applyAction(CefBrowser browser, int action) {
        switch (action) {
            case IN -> zoomIn(browser);
            case OUT -> zoomOut(browser);
            case RESET -> zoomReset(browser);
            default -> {
            }
        }
    }

    public static void restore(CefBrowser browser) {
        if (browser == null) {
            return;
        }
        browser.setZoomLevel(readPersistedZoom());
    }

    /**
     * Detect Ctrl/Cmd + / - / 0 (including numpad and Shift+=).
     *
     * @return {@link #NONE}, {@link #IN}, {@link #OUT}, or {@link #RESET}
     */
    public static int actionFromKeyEvent(CefKeyboardHandler.CefKeyEvent event) {
        if (event == null) {
            return NONE;
        }
        return actionFromKey(event.windows_key_code, event.modifiers);
    }

    public static int actionFromKey(int windowsKeyCode, int modifiers) {
        boolean ctrlOrCmd = (modifiers & EventFlags.EVENTFLAG_CONTROL_DOWN) != 0
                || (modifiers & EventFlags.EVENTFLAG_COMMAND_DOWN) != 0;
        if (!ctrlOrCmd) {
            return NONE;
        }
        // Avoid stealing Ctrl+Shift+… (DevTools, etc.)
        if ((modifiers & EventFlags.EVENTFLAG_SHIFT_DOWN) != 0
                && windowsKeyCode != KeyEvent.VK_EQUALS
                && windowsKeyCode != KeyEvent.VK_PLUS) {
            return NONE;
        }
        if (windowsKeyCode == KeyEvent.VK_0 || windowsKeyCode == KeyEvent.VK_NUMPAD0) {
            return RESET;
        }
        if (windowsKeyCode == KeyEvent.VK_EQUALS || windowsKeyCode == KeyEvent.VK_ADD || windowsKeyCode == KeyEvent.VK_PLUS) {
            return IN;
        }
        if (windowsKeyCode == KeyEvent.VK_MINUS || windowsKeyCode == KeyEvent.VK_SUBTRACT) {
            return OUT;
        }
        return NONE;
    }

    public static void persistZoom(double level) {
        double clamped = Math.max(MIN, Math.min(MAX, level));
        try {
            DesktopChromeStore.writeZoomLevel(clamped);
        } catch (Exception ignored) {
        }
        // Keep window-state mirror for older builds / diagnostics.
        try {
            JsonObject state = WindowStateStore.read();
            state.addProperty("zoomLevel", clamped);
            WindowStateStore.write(state);
        } catch (Exception ignored) {
        }
    }

    public static double readPersistedZoom() {
        try {
            // Lazy legacy migrate — must not run on paint-critical chrome load.
            return DesktopChromeStore.zoomLevelForRestore();
        } catch (Exception ignored) {
        }
        return 0.0;
    }

    private static void adjust(CefBrowser browser, double delta) {
        if (browser == null) {
            return;
        }
        double next = Math.max(MIN, Math.min(MAX, browser.getZoomLevel() + delta));
        browser.setZoomLevel(next);
        persistZoom(next);
    }
}
