package org.apache.datawise.desktop.ui;

import com.formdev.flatlaf.FlatDarkLaf;
import com.formdev.flatlaf.FlatLightLaf;
import com.formdev.flatlaf.FlatLaf;
import org.apache.datawise.desktop.util.SystemThemeUtil;
import org.cef.OS;

import javax.swing.SwingUtilities;
import javax.swing.UIManager;
import java.awt.Toolkit;
import java.awt.Window;
import java.beans.PropertyChangeListener;

/**
 * Installs FlatLaf on Win/Linux for dialogs / tray menus; macOS keeps system L&F
 * (screen menu bar). Appearance follows {@link SystemThemeUtil}.
 */
public final class DesktopLookAndFeel {
    private static volatile boolean installed;
    private static volatile String appliedAppearance;
    private static PropertyChangeListener windowsThemeListener;

    private DesktopLookAndFeel() {
    }

    public static void install() {
        if (installed) {
            applySystemAppearance();
            return;
        }
        installed = true;
        if (isFlatLafDisabled() || OS.isMacintosh()) {
            try {
                UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
            } catch (Exception e) {
                System.err.println("[datawise-desktop] system L&F failed: " + e.getMessage());
            }
            return;
        }
        applySystemAppearance();
        installWindowsThemeWatcher();
    }

    private static boolean isFlatLafDisabled() {
        String env = System.getenv("DATAWISE_FLATLAF");
        if (env != null && (env.equals("0") || env.equalsIgnoreCase("false"))) {
            return true;
        }
        return "false".equalsIgnoreCase(System.getProperty("datawise.flatlaf", "true"));
    }

    /** Re-read OS appearance and switch FlatLight / FlatDark when needed. */
    public static void applySystemAppearance() {
        applyAppearance(SystemThemeUtil.resolveAppearance());
    }

    public static void applyAppearance(String appearance) {
        if (OS.isMacintosh() || isFlatLafDisabled()) {
            return;
        }
        String next = "dark".equalsIgnoreCase(appearance) ? "dark" : "light";
        if (next.equals(appliedAppearance) && UIManager.getLookAndFeel() instanceof FlatLaf) {
            return;
        }
        try {
            if ("dark".equals(next)) {
                FlatDarkLaf.setup();
            } else {
                FlatLightLaf.setup();
            }
            appliedAppearance = next;
            for (Window window : Window.getWindows()) {
                SwingUtilities.updateComponentTreeUI(window);
            }
        } catch (Exception e) {
            System.err.println("[datawise-desktop] FlatLaf setup failed: " + e.getMessage());
            try {
                UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
            } catch (Exception ignored) {
            }
        }
    }

    private static void installWindowsThemeWatcher() {
        String os = System.getProperty("os.name", "").toLowerCase();
        if (!os.contains("win")) {
            return;
        }
        if (windowsThemeListener != null) {
            return;
        }
        windowsThemeListener = evt -> {
            if ("win.application.darkMode".equals(evt.getPropertyName())) {
                SwingUtilities.invokeLater(DesktopLookAndFeel::applySystemAppearance);
            }
        };
        Toolkit.getDefaultToolkit().addPropertyChangeListener("win.application.darkMode", windowsThemeListener);
    }
}
