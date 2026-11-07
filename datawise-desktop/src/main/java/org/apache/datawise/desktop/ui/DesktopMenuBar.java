package org.apache.datawise.desktop.ui;

import org.cef.OS;
import org.cef.browser.CefBrowser;
import org.cef.browser.CefFrame;

import javax.swing.JFrame;
import javax.swing.JMenu;
import javax.swing.JMenuBar;
import javax.swing.JMenuItem;
import javax.swing.KeyStroke;
import javax.swing.SwingUtilities;
import java.awt.Desktop;
import java.awt.Toolkit;
import java.awt.event.InputEvent;
import java.awt.event.KeyEvent;
import java.net.URI;

/**
 * Native menu bar: Edit (CEF clipboard), View, Help.
 */
public final class DesktopMenuBar {
    private DesktopMenuBar() {
    }

    public static void install(
            JFrame frame,
            CefBrowser browser,
            Runnable openRuntimeLog,
            Runnable toggleDevTools
    ) {
        if (OS.isMacintosh()) {
            configureMacScreenMenuBar();
        }
        SwingUtilities.invokeLater(() ->
                frame.setJMenuBar(createMenuBar(browser, openRuntimeLog, toggleDevTools)));
    }

    private static void configureMacScreenMenuBar() {
        String version = System.getProperty("os.version", "");
        if (!version.startsWith("14.1")) {
            System.setProperty("apple.laf.useScreenMenuBar", "true");
        }
    }

    private static JMenuBar createMenuBar(
            CefBrowser browser,
            Runnable openRuntimeLog,
            Runnable toggleDevTools
    ) {
        JMenuBar menuBar = new JMenuBar();

        JMenu editMenu = new JMenu("Edit");
        // Do not bind Ctrl/Cmd+C/V/X/A accelerators: on JCEF/Windows they steal keystrokes
        // from xterm.js (SSH Tab / interrupt / paste) before the page handlers run.
        // Menu items remain clickable for CEF HTML selection clipboard.
        editMenu.add(clipboardItem("Cut", () -> runOnFocusedFrame(browser, CefFrame::cut)));
        editMenu.add(clipboardItem("Copy", () -> runOnFocusedFrame(browser, CefFrame::copy)));
        editMenu.add(clipboardItem("Paste", () -> runOnFocusedFrame(browser, CefFrame::paste)));
        editMenu.add(clipboardItem("Select All", () -> runOnFocusedFrame(browser, CefFrame::selectAll)));
        menuBar.add(editMenu);

        JMenu viewMenu = new JMenu("View");
        JMenuItem reload = new JMenuItem("Reload");
        reload.setAccelerator(KeyStroke.getKeyStroke(KeyEvent.VK_R, menuShortcutMask() | InputEvent.SHIFT_DOWN_MASK));
        reload.addActionListener(e -> {
            if (browser != null) {
                browser.reload();
            }
        });
        viewMenu.add(reload);
        viewMenu.addSeparator();
        viewMenu.add(zoomItem("Zoom In", KeyEvent.VK_EQUALS, () -> DesktopBrowserZoom.zoomIn(browser)));
        viewMenu.add(zoomItem("Zoom Out", KeyEvent.VK_MINUS, () -> DesktopBrowserZoom.zoomOut(browser)));
        viewMenu.add(zoomItem("Actual Size", KeyEvent.VK_0, () -> DesktopBrowserZoom.zoomReset(browser)));
        if (toggleDevTools != null) {
            viewMenu.addSeparator();
            JMenuItem devTools = new JMenuItem("Toggle Developer Tools");
            devTools.setAccelerator(KeyStroke.getKeyStroke(KeyEvent.VK_F12, 0));
            devTools.addActionListener(e -> toggleDevTools.run());
            viewMenu.add(devTools);
        }
        menuBar.add(viewMenu);

        JMenu helpMenu = new JMenu("Help");
        JMenuItem logs = new JMenuItem("Open Runtime Log");
        logs.addActionListener(e -> {
            if (openRuntimeLog != null) {
                openRuntimeLog.run();
            }
        });
        helpMenu.add(logs);
        helpMenu.addSeparator();
        String docsUrl = resolveGithubRepoUrl();
        if (!docsUrl.isEmpty()) {
            helpMenu.add(urlItem("Documentation", docsUrl));
        }
        menuBar.add(helpMenu);

        if (OS.isMacintosh()) {
            menuBar.add(javax.swing.Box.createHorizontalGlue());
        }
        return menuBar;
    }

    private static JMenuItem clipboardItem(String label, Runnable action) {
        JMenuItem item = new JMenuItem(label);
        item.addActionListener(e -> action.run());
        return item;
    }

    private static JMenuItem zoomItem(String label, int key, Runnable action) {
        JMenuItem item = new JMenuItem(label);
        item.setAccelerator(KeyStroke.getKeyStroke(key, menuShortcutMask()));
        item.addActionListener(e -> action.run());
        return item;
    }

    private static JMenuItem urlItem(String label, String url) {
        JMenuItem item = new JMenuItem(label);
        item.addActionListener(e -> {
            try {
                if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                    Desktop.getDesktop().browse(new URI(url));
                }
            } catch (Exception ignored) {
            }
        });
        return item;
    }

    /** Defaults to {@code gouyehappy/datawise-cli}; override via env / {@code -Ddatawise.github.repo}. */
    private static String resolveGithubRepoUrl() {
        String env = System.getenv("DATAWISE_GITHUB_REPO");
        String slug = (env != null && !env.isBlank())
                ? env.trim()
                : System.getProperty("datawise.github.repo", "gouyehappy/datawise-cli").trim();
        return slug.isEmpty() ? "" : "https://github.com/" + slug;
    }

    private static int menuShortcutMask() {
        return Toolkit.getDefaultToolkit().getMenuShortcutKeyMaskEx();
    }

    private static void runOnFocusedFrame(CefBrowser browser, FrameAction action) {
        if (browser == null) {
            return;
        }
        CefFrame frame = browser.getFocusedFrame();
        if (frame != null) {
            action.run(frame);
        }
    }

    @FunctionalInterface
    private interface FrameAction {
        void run(CefFrame frame);
    }
}
