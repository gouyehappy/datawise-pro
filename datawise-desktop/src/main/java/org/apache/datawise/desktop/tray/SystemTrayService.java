package org.apache.datawise.desktop.tray;

import org.apache.datawise.desktop.DesktopAppIcons;

import javax.swing.JFrame;
import javax.swing.SwingUtilities;
import java.awt.AWTException;
import java.awt.Image;
import java.awt.MenuItem;
import java.awt.PopupMenu;
import java.awt.SystemTray;
import java.awt.TrayIcon;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.util.function.BooleanSupplier;

/**
 * System tray. AWT {@link PopupMenu} on Windows is ANSI/system-codepage — keep action labels ASCII
 * to avoid mojibake; balloon tip also uses ASCII for the same reason.
 */
public final class SystemTrayService {
    private static final String NOTIFY_TITLE = "Still running in the background";
    private static final String NOTIFY_BODY =
            "Click the tray icon to restore the window, or right-click the tray icon to quit.";

    private final JFrame mainFrame;
    private final BooleanSupplier isQuitting;
    private final Runnable onQuit;
    private TrayIcon trayIcon;
    private boolean closeToTray = true;

    public SystemTrayService(JFrame mainFrame, BooleanSupplier isQuitting, Runnable onQuit) {
        this.mainFrame = mainFrame;
        this.isQuitting = isQuitting;
        this.onQuit = onQuit;
    }

    public void install() {
        if (!SystemTray.isSupported()) {
            return;
        }
        try {
            PopupMenu menu = buildTrayMenu();

            Image image = DesktopAppIcons.trayIcon();
            trayIcon = new TrayIcon(image, "DataWise CLI", menu);
            trayIcon.setImageAutoSize(true);
            trayIcon.addActionListener(e -> SwingUtilities.invokeLater(this::showMain));
            trayIcon.addMouseListener(new MouseAdapter() {
                @Override
                public void mousePressed(MouseEvent e) {
                    if (e.isPopupTrigger()) {
                        refreshTrayMenu();
                    }
                }

                @Override
                public void mouseReleased(MouseEvent e) {
                    if (e.isPopupTrigger()) {
                        refreshTrayMenu();
                    }
                }
            });
            SystemTray.getSystemTray().add(trayIcon);
        } catch (AWTException e) {
            System.err.println("[datawise-desktop] tray unavailable: " + e.getMessage());
        }
    }

    private PopupMenu buildTrayMenu() {
        PopupMenu menu = new PopupMenu();

        MenuItem header = new MenuItem("DataWise CLI");
        header.setEnabled(false);
        menu.add(header);

        MenuItem hint = new MenuItem(trayStatusHint());
        hint.setEnabled(false);
        menu.add(hint);

        menu.addSeparator();

        MenuItem show = new MenuItem(mainWindowMenuLabel());
        show.addActionListener(e -> SwingUtilities.invokeLater(this::showMain));
        menu.add(show);

        menu.addSeparator();

        MenuItem quit = new MenuItem("Exit DataWise");
        quit.addActionListener(e -> quitFromTray());
        menu.add(quit);

        return menu;
    }

    private String trayStatusHint() {
        return mainFrame.isVisible() && (mainFrame.getExtendedState() & JFrame.ICONIFIED) == 0
                ? "Window is open"
                : "Click icon to restore";
    }

    private String mainWindowMenuLabel() {
        return mainFrame.isVisible() && (mainFrame.getExtendedState() & JFrame.ICONIFIED) == 0
                ? "Focus Main Window"
                : "Open Main Window";
    }

    private void refreshTrayMenu() {
        if (trayIcon == null) {
            return;
        }
        trayIcon.setPopupMenu(buildTrayMenu());
    }

    private void quitFromTray() {
        closeToTray = false;
        dispose();
        try {
            mainFrame.setVisible(false);
        } catch (Exception ignored) {
        }
        // Backup halt if graceful quit stalls (CEF dispose / EDT block).
        Thread backup = new Thread(() -> {
            try {
                Thread.sleep(4_000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
            Runtime.getRuntime().halt(0);
        }, "datawise-tray-quit-backup");
        backup.setDaemon(true);
        backup.start();
        if (onQuit != null) {
            runQuitHandler(onQuit);
            return;
        }
        try {
            mainFrame.dispose();
        } catch (Exception ignored) {
        }
        System.exit(0);
    }

    private static void runQuitHandler(Runnable onQuit) {
        try {
            if (SwingUtilities.isEventDispatchThread()) {
                onQuit.run();
            } else {
                SwingUtilities.invokeAndWait(onQuit);
            }
        } catch (Exception e) {
            try {
                onQuit.run();
            } catch (Exception ignored) {
            }
            Runtime.getRuntime().halt(0);
        }
    }

    public boolean handleWindowClosing() {
        if (!closeToTray || isQuitting.getAsBoolean() || trayIcon == null) {
            return false;
        }
        hideToTray(true);
        return true;
    }

    public void hideToTray(boolean notify) {
        boolean wasVisible = mainFrame.isVisible();
        mainFrame.setVisible(false);
        refreshTrayMenu();
        if (notify && wasVisible && trayIcon != null) {
            try {
                trayIcon.displayMessage(NOTIFY_TITLE, NOTIFY_BODY, TrayIcon.MessageType.INFO);
            } catch (Exception e) {
                System.err.println("[datawise-desktop] tray notify failed: " + e.getMessage());
            }
        }
    }

    public void showMain() {
        mainFrame.setVisible(true);
        mainFrame.setExtendedState(mainFrame.getExtendedState() & ~JFrame.ICONIFIED);
        mainFrame.toFront();
        mainFrame.requestFocus();
        refreshTrayMenu();
    }

    public void dispose() {
        if (trayIcon != null && SystemTray.isSupported()) {
            SystemTray.getSystemTray().remove(trayIcon);
            trayIcon = null;
        }
    }
}
