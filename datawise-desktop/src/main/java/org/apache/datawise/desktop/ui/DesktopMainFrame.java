package org.apache.datawise.desktop.ui;

import com.google.gson.JsonObject;
import org.apache.datawise.desktop.DesktopAppIcons;
import org.apache.datawise.desktop.backend.BackendProcessService;
import org.apache.datawise.desktop.bridge.DesktopBridgeRouter;
import org.apache.datawise.desktop.cef.DesktopCefBootstrap;
import org.apache.datawise.desktop.cef.DesktopNativeContextMenu;
import org.apache.datawise.desktop.cef.DesktopOpenLinksLifeSpanHandler;
import org.apache.datawise.desktop.deeplink.SingleInstanceGuard;
import org.apache.datawise.desktop.prefs.WindowStateStore;
import org.apache.datawise.desktop.updater.DesktopUpdaterService;
import org.cef.CefApp;
import org.cef.CefClient;
import org.cef.browser.CefBrowser;
import org.cef.browser.CefFrame;
import org.cef.browser.CefMessageRouter;
import org.cef.handler.CefKeyboardHandler;
import org.cef.handler.CefKeyboardHandlerAdapter;
import org.cef.handler.CefLoadHandler;
import org.cef.handler.CefLoadHandlerAdapter;
import org.cef.misc.BoolRef;
import org.cef.misc.EventFlags;
import org.cef.network.CefRequest;

import javax.swing.JComponent;
import javax.swing.JFrame;
import javax.swing.JPanel;
import javax.swing.JSplitPane;
import javax.swing.KeyStroke;
import javax.swing.SwingUtilities;
import javax.swing.Timer;
import javax.swing.WindowConstants;
import java.awt.BorderLayout;
import java.awt.Dimension;
import java.awt.Rectangle;
import java.awt.Toolkit;
import java.awt.event.ComponentAdapter;
import java.awt.event.ComponentEvent;
import java.awt.event.KeyEvent;
import java.awt.event.WindowAdapter;
import java.awt.event.WindowEvent;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

/**
 * Main JCEF window hosting the Vue renderer (JetBrains JCEF / JBR).
 */
public final class DesktopMainFrame extends JFrame {
    private final CefApp cefApp;
    private final CefClient client;
    private final CefBrowser browser;
    private final DesktopBridgeRouter bridge;
    private final BackendProcessService backend;
    private final SingleInstanceGuard singleInstanceGuard;
    private final String startUrl;
    private final String bridgeScript;
    private final BooleanSupplier closeToTray;
    private final boolean frameless;
    private final boolean devToolsEnabled;
    private Timer persistTimer;
    private volatile boolean revealRequested;
    private volatile boolean revealed;
    private volatile boolean mainDocumentLoaded;
    private volatile boolean appRendererLoaded;
    private volatile boolean spaLoadOk;
    private volatile boolean reloadedAfterBackendReady;
    private volatile boolean backendReady;
    private volatile int postReadyLoadRetries;
    private Timer revealFallbackTimer;
    private Timer revealPaintTimer;
    private Timer mountWatchdogTimer;
    private Timer loadRetryTimer;
    private Timer bootCoverDismissTimer;
    private JSplitPane browserSplit;
    private CefBrowser devToolsBrowser;
    private JFrame devToolsFrame;
    private volatile boolean devToolsVisible;
    private DesktopBootCover bootCover;

    public DesktopMainFrame(
            String startUrl,
            String platform,
            String bridgeScript,
            BackendProcessService backend,
            DesktopUpdaterService updater,
            SingleInstanceGuard singleInstance,
            BooleanSupplier closeToTray
    ) throws InterruptedException {
        super("DataWise CLI");
        this.backend = backend;
        this.singleInstanceGuard = singleInstance;
        this.startUrl = startUrl;
        this.closeToTray = closeToTray;
        this.frameless = !"darwin".equals(platform);
        this.bridgeScript = bridgeScript;
        this.devToolsEnabled = isDevToolsEnabled();

        if (frameless) {
            setUndecorated(true);
        }
        DesktopAppIcons.applyToWindow(this);

        this.cefApp = DesktopCefBootstrap.ensureStarted(new String[0]);
        this.client = cefApp.createClient();

        this.bridge = new DesktopBridgeRouter(this, backend, updater, singleInstance, this::focusBrowser);
        CefMessageRouter messageRouter = CefMessageRouter.create();
        messageRouter.addHandler(bridge, true);
        client.addMessageRouter(messageRouter);

        client.addLoadHandler(new CefLoadHandlerAdapter() {
            @Override
            public void onLoadStart(CefBrowser browser, CefFrame frame, CefRequest.TransitionType transitionType) {
                if (frame != null && frame.isMain()) {
                    browser.executeJavaScript(SplashThemeInjector.earlyPaintJs(), frame.getURL(), 0);
                    browser.executeJavaScript(bridgeScript, frame.getURL(), 0);
                }
            }

            @Override
            public void onLoadEnd(CefBrowser browser, CefFrame frame, int httpStatusCode) {
                if (frame != null && frame.isMain()) {
                    browser.executeJavaScript(bridgeScript, frame.getURL(), 0);
                    spaLoadOk = httpStatusCode >= 200 && httpStatusCode < 400;
                    if (spaLoadOk) {
                        appRendererLoaded = true;
                        postReadyLoadRetries = 0;
                        if (loadRetryTimer != null) {
                            loadRetryTimer.stop();
                            loadRetryTimer = null;
                        }
                    }
                    mainDocumentLoaded = true;
                    // 等开屏脚本/首帧 chrome 落地后再 reveal，避免 CEF 默认白屏抢一帧
                    if (revealPaintTimer != null) {
                        revealPaintTimer.stop();
                    }
                    revealPaintTimer = new Timer(64, e -> tryRevealWindow());
                    revealPaintTimer.setRepeats(false);
                    revealPaintTimer.start();
                }
            }

            @Override
            public void onLoadError(
                    CefBrowser browser,
                    CefFrame frame,
                    CefLoadHandler.ErrorCode errorCode,
                    String errorText,
                    String failedUrl
            ) {
                if (frame == null || !frame.isMain()) {
                    return;
                }
                System.err.println("[datawise-desktop] CEF load error "
                        + errorCode + " url=" + failedUrl + " " + errorText);
                spaLoadOk = false;
                mainDocumentLoaded = true;
                if (revealPaintTimer != null) {
                    revealPaintTimer.stop();
                }
                revealPaintTimer = new Timer(64, e -> tryRevealWindow());
                revealPaintTimer.setRepeats(false);
                revealPaintTimer.start();
                if (backendReady) {
                    scheduleLoadRetryAfterError();
                }
            }
        });

        // CEF eats most keys while focused — catch zoom / F12 before Chromium.
        client.addKeyboardHandler(new CefKeyboardHandlerAdapter() {
            @Override
            public boolean onPreKeyEvent(
                    CefBrowser browser,
                    CefKeyboardHandler.CefKeyEvent event,
                    BoolRef isKeyboardShortcut
            ) {
                if (event == null || event.type != CefKeyboardHandler.CefKeyEvent.EventType.KEYEVENT_RAWKEYDOWN) {
                    return false;
                }
                if (devToolsEnabled && isToggleDevToolsKey(event)) {
                    SwingUtilities.invokeLater(() -> toggleDevTools());
                    return true;
                }
                int zoomAction = DesktopBrowserZoom.actionFromKeyEvent(event);
                if (zoomAction != DesktopBrowserZoom.NONE) {
                    SwingUtilities.invokeLater(() -> DesktopBrowserZoom.applyAction(browser, zoomAction));
                    return true;
                }
                return false;
            }
        });

        // Drop Chromium Back/Forward/Print/View-source; Vue owns context menus.
        DesktopNativeContextMenu.suppress(client);
        // Markdown / <a target=_blank> popups → OS browser when preference says so.
        client.addLifeSpanHandler(new DesktopOpenLinksLifeSpanHandler());

        this.browser = client.createBrowser(startUrl, false, false);
        bridge.bindBrowser(browser);
        applyBootSurface();
        backend.addListener(event -> SwingUtilities.invokeLater(() -> {
            if (bootCover != null) {
                bootCover.setStartupStatus(event.phase(), event.progress());
            }
            if (event.phase() != BackendProcessService.Phase.ready) {
                return;
            }
            backendReady = true;
            if (!appRendererLoaded || !spaLoadOk) {
                reloadRendererAfterBackendReady();
            }
            scheduleMountWatchdog();
        }));
        updater.setAfterFrontendApply(() -> SwingUtilities.invokeLater(() -> {
            try {
                if (browser != null) {
                    browser.reload();
                }
            } catch (Exception e) {
                System.err.println("[datawise-desktop] frontend reload after update failed: " + e.getMessage());
            }
        }));
        updater.setRelaunchHandler(() -> {
            Thread t = new Thread(
                    () -> org.apache.datawise.desktop.process.ProcessRelauncher.relaunch(
                            backend, singleInstanceGuard),
                    "datawise-updater-relaunch"
            );
            t.setDaemon(false);
            t.start();
        });

        setDefaultCloseOperation(WindowConstants.DO_NOTHING_ON_CLOSE);
        setMinimumSize(new Dimension(1100, 680));
        JComponent ui = (JComponent) browser.getUIComponent();
        mountBrowserUi(ui);
        if (bootCover != null) {
            BackendProcessService.StartupEvent startup = backend.getStartupState();
            bootCover.setStartupStatus(startup.phase(), startup.progress());
        }
        installFileDrop(ui);

        applySavedBounds();
        bindPersistHooks();
        installDevToolsShortcut();
        installZoomShortcuts();
        // Native JMenuBar is useful on macOS (screen menu). Win/Linux are frameless + Vue title bar —
        // Swing setJMenuBar is effectively invisible there; wire actions into the web Help menu instead.
        if (!frameless) {
            DesktopMenuBar.install(
                    this,
                    browser,
                    () -> bridge.openRuntimeLogFromMenu(),
                    devToolsEnabled ? this::toggleDevTools : null
            );
        }

        addWindowListener(new WindowAdapter() {
            @Override
            public void windowClosing(WindowEvent e) {
                persistWindowStateNow();
                if (closeToTray.getAsBoolean()) {
                    return;
                }
                shutdown();
            }

            @Override
            public void windowOpened(WindowEvent e) {
                FramelessResizeSupport.notifyBrowserResized(browser, DesktopMainFrame.this);
                bridge.pushSystemTheme();
            }
        });
    }

    private void mountBrowserUi(JComponent ui) {
        if (frameless) {
            bootCover = FramelessResizeSupport.install(this, ui, browser);
        } else {
            browserSplit = new JSplitPane(JSplitPane.HORIZONTAL_SPLIT);
            browserSplit.setResizeWeight(0.72);
            JPanel leftHost = new JPanel(new BorderLayout());
            bootCover = DesktopBootCover.install(leftHost, ui);
            browserSplit.setLeftComponent(leftHost);
            browserSplit.setRightComponent(null);
            browserSplit.setOneTouchExpandable(true);
            setLayout(new BorderLayout());
            add(browserSplit, BorderLayout.CENTER);
        }
    }

    private void installDevToolsShortcut() {
        if (!devToolsEnabled) {
            return;
        }
        KeyStroke f12 = KeyStroke.getKeyStroke(KeyEvent.VK_F12, 0);
        getRootPane().registerKeyboardAction(e -> toggleDevTools(), "toggleDevTools", f12, JComponent.WHEN_IN_FOCUSED_WINDOW);
    }

    private void installZoomShortcuts() {
        int mask = Toolkit.getDefaultToolkit().getMenuShortcutKeyMaskEx();
        JComponent root = getRootPane();
        root.registerKeyboardAction(
                e -> DesktopBrowserZoom.zoomIn(browser),
                "zoomIn",
                KeyStroke.getKeyStroke(KeyEvent.VK_EQUALS, mask),
                JComponent.WHEN_IN_FOCUSED_WINDOW
        );
        root.registerKeyboardAction(
                e -> DesktopBrowserZoom.zoomIn(browser),
                "zoomInPlus",
                KeyStroke.getKeyStroke(KeyEvent.VK_ADD, mask),
                JComponent.WHEN_IN_FOCUSED_WINDOW
        );
        root.registerKeyboardAction(
                e -> DesktopBrowserZoom.zoomOut(browser),
                "zoomOut",
                KeyStroke.getKeyStroke(KeyEvent.VK_MINUS, mask),
                JComponent.WHEN_IN_FOCUSED_WINDOW
        );
        root.registerKeyboardAction(
                e -> DesktopBrowserZoom.zoomOut(browser),
                "zoomOutSub",
                KeyStroke.getKeyStroke(KeyEvent.VK_SUBTRACT, mask),
                JComponent.WHEN_IN_FOCUSED_WINDOW
        );
        root.registerKeyboardAction(
                e -> DesktopBrowserZoom.zoomReset(browser),
                "zoomReset",
                KeyStroke.getKeyStroke(KeyEvent.VK_0, mask),
                JComponent.WHEN_IN_FOCUSED_WINDOW
        );
    }

    private void installFileDrop(JComponent cefUi) {
        Consumer<java.nio.file.Path> open = path ->
                SwingUtilities.invokeLater(() -> bridge.pushOpenFile(path.toString()));
        DesktopFileDropSupport.install(cefUi, open);
        DesktopFileDropSupport.install(getContentPane(), open);
        DesktopFileDropSupport.install(this, open);
    }

    public static boolean isDevToolsEnabled() {
        String env = System.getenv("DATAWISE_CEF_DEVTOOLS");
        if (env != null) {
            if (env.equals("1") || env.equalsIgnoreCase("true")) {
                return true;
            }
            if (env.equals("0") || env.equalsIgnoreCase("false")) {
                return false;
            }
        }
        if (Boolean.parseBoolean(System.getProperty("datawise.cef.devtools", "false"))) {
            return true;
        }
        boolean packaged = Boolean.parseBoolean(System.getProperty("datawise.packaged", "false"))
                || Boolean.parseBoolean(System.getenv().getOrDefault("DATAWISE_PACKAGED", "false"));
        return !packaged;
    }

    private static boolean isToggleDevToolsKey(CefKeyboardHandler.CefKeyEvent event) {
        if (event.windows_key_code == KeyEvent.VK_F12) {
            return true;
        }
        boolean ctrlOrCmd = (event.modifiers & EventFlags.EVENTFLAG_CONTROL_DOWN) != 0
                || (event.modifiers & EventFlags.EVENTFLAG_COMMAND_DOWN) != 0;
        boolean shift = (event.modifiers & EventFlags.EVENTFLAG_SHIFT_DOWN) != 0;
        return ctrlOrCmd && shift && event.windows_key_code == KeyEvent.VK_I;
    }

    public void toggleDevTools() {
        if (!devToolsEnabled) {
            return;
        }
        SwingUtilities.invokeLater(() -> {
            try {
                if (devToolsBrowser == null) {
                    devToolsBrowser = browser.getDevTools();
                }
                JComponent devUi = (JComponent) devToolsBrowser.getUIComponent();
                if (frameless || browserSplit == null) {
                    toggleDevToolsWindow(devUi);
                } else {
                    toggleDevToolsSplit(devUi);
                }
            } catch (Exception e) {
                System.err.println("[datawise-desktop] DevTools unavailable: " + e.getMessage());
            }
        });
    }

    private void toggleDevToolsSplit(JComponent devUi) {
        if (!devToolsVisible) {
            browserSplit.setRightComponent(devUi);
            browserSplit.setDividerLocation(0.72);
            browserSplit.getRightComponent().setVisible(true);
            devToolsVisible = true;
        } else {
            if (browserSplit.getRightComponent() != null) {
                browserSplit.getRightComponent().setVisible(false);
            }
            browserSplit.setDividerLocation(1.0);
            browserSplit.setRightComponent(null);
            devToolsVisible = false;
        }
        browserSplit.revalidate();
        browserSplit.repaint();
        focusBrowser();
    }

    private void toggleDevToolsWindow(JComponent devUi) {
        if (devToolsFrame != null && devToolsFrame.isDisplayable()) {
            if (devToolsVisible && devToolsFrame.isVisible()) {
                devToolsFrame.setVisible(false);
                devToolsVisible = false;
                focusBrowser();
                return;
            }
            devToolsFrame.setVisible(true);
            devToolsFrame.toFront();
            devToolsVisible = true;
            return;
        }
        JFrame frame = new JFrame("DataWise DevTools");
        frame.setDefaultCloseOperation(WindowConstants.HIDE_ON_CLOSE);
        frame.setLayout(new BorderLayout());
        frame.add(devUi, BorderLayout.CENTER);
        frame.setSize(960, 720);
        frame.setLocationRelativeTo(this);
        frame.addWindowListener(new WindowAdapter() {
            @Override
            public void windowClosing(WindowEvent e) {
                devToolsVisible = false;
            }
        });
        DesktopAppIcons.applyToWindow(frame);
        frame.setVisible(true);
        devToolsFrame = frame;
        devToolsVisible = true;
        System.out.println("[datawise-desktop] DevTools window opened (F12 / Ctrl+Shift+I to toggle)");
    }

    public DesktopBridgeRouter bridge() {
        return bridge;
    }

    public void focusBrowser() {
        SwingUtilities.invokeLater(() -> {
            try {
                browser.setFocus(true);
                JComponent ui = (JComponent) browser.getUIComponent();
                if (ui != null) {
                    ui.requestFocusInWindow();
                }
            } catch (Exception ignored) {
            }
        });
    }

    public void showFromDock() {
        SwingUtilities.invokeLater(() -> {
            setVisible(true);
            toFront();
            requestFocus();
            focusBrowser();
        });
    }

    /** Explicit quit (tray Exit / OS quit). Never hide-to-tray. */
    public void requestGracefulQuit() {
        shutdown();
    }

    private static final int MIN_WINDOW_WIDTH = 1100;
    private static final int MIN_WINDOW_HEIGHT = 680;

    private void applySavedBounds() {
        JsonObject state = WindowStateStore.read();
        // Match setMinimumSize — never restore below the shell's supported workbench size.
        int width = Math.max(MIN_WINDOW_WIDTH, WindowStateStore.intOr(state, "width", 1440));
        int height = Math.max(MIN_WINDOW_HEIGHT, WindowStateStore.intOr(state, "height", 900));
        int x = WindowStateStore.intOr(state, "x", Integer.MIN_VALUE);
        int y = WindowStateStore.intOr(state, "y", Integer.MIN_VALUE);
        boolean maximized = WindowStateStore.boolOr(state, "maximized", false)
                || WindowStateStore.boolOr(state, "isMaximized", false);
        Rectangle work = WindowChromeController.workArea(this);
        if (work.width > 0) {
            width = Math.min(width, Math.max(MIN_WINDOW_WIDTH, work.width));
            // Tiny / high-DPI work areas: prefer fitting the visible screen over overflowing.
            if (work.width < MIN_WINDOW_WIDTH) {
                width = Math.max(work.width, 800);
            }
        }
        if (work.height > 0) {
            height = Math.min(height, Math.max(MIN_WINDOW_HEIGHT, work.height));
            if (work.height < MIN_WINDOW_HEIGHT) {
                height = Math.max(work.height, 600);
            }
        }
        if (x != Integer.MIN_VALUE && y != Integer.MIN_VALUE) {
            // Nudge origin so the restored frame stays mostly inside the work area.
            if (work.width > 0 && work.height > 0) {
                x = Math.min(Math.max(work.x, x), Math.max(work.x, work.x + work.width - width));
                y = Math.min(Math.max(work.y, y), Math.max(work.y, work.y + work.height - height));
            }
            setBounds(x, y, width, height);
        } else {
            setSize(width, height);
            setLocationRelativeTo(null);
        }
        if (maximized) {
            Rectangle normal = getBounds();
            setBounds(work);
            bridge.chrome().markMaximized(true, normal);
        }
    }

    /** Vue Shell 首帧 — 翻开 CEF（CardLayout），露出骨架 */
    public void onRendererAppMounted() {
        // Same paint-then-dismiss path as boot-ready (avoid white flash between cover and shell).
        onRendererBootReady();
        SwingUtilities.invokeLater(() -> {
            if (!isVisible()) {
                tryRevealWindow();
            }
        });
    }

    /** bootstrap 完成 — 对齐 AWT；若挂载通知丢失则兜底翻开 CEF */
    public void onRendererBootReady() {
        SwingUtilities.invokeLater(() -> {
            applyBootSurface();
            // Re-assert host chrome on the document, then flip CardLayout after a paint beat
            // so CEF never shows a default white frame between cover and shell.
            String chrome = org.apache.datawise.desktop.ui.SplashTheme.resolve().chromeBg();
            String safeChrome = chrome.replace("\\", "\\\\").replace("'", "\\'");
            try {
                if (browser != null) {
                    browser.executeJavaScript(
                            "try{var c='" + safeChrome + "';"
                                    + "document.documentElement.style.backgroundColor=c;"
                                    + "if(document.body)document.body.style.backgroundColor=c;"
                                    + "var el=document.getElementById('dw-open-screen');"
                                    + "if(el)el.style.background=c;"
                                    + "window.__DW_HOST_CHROME__=c;window.__DW_BOOT_CHROME__=c;"
                                    + "}catch(e){}",
                            browser.getURL(),
                            0
                    );
                }
            } catch (Exception ignored) {
            }
            clearOpenScreen();
            if (bootCoverDismissTimer != null) {
                bootCoverDismissTimer.stop();
            }
            bootCoverDismissTimer = new Timer(48, e -> {
                dismissBootCover();
                focusBrowser();
                FramelessResizeSupport.notifyBrowserResized(browser, DesktopMainFrame.this);
                org.apache.datawise.desktop.startup.DesktopStartupTiming.markShellReady();
            });
            bootCoverDismissTimer.setRepeats(false);
            bootCoverDismissTimer.start();
        });
    }

    private void dismissBootCover() {
        if (bootCover != null) {
            bootCover.dismiss();
        }
    }

    /** Theme prefs synced from renderer — repaint AWT chrome like Chat2DB ThemeUtil.setThemeColor */
    public void applyThemeSurfaceFromHostPrefs() {
        SwingUtilities.invokeLater(this::applyBootSurface);
    }

    private void clearOpenScreen() {
        if (browser == null) {
            return;
        }
        try {
            browser.executeJavaScript(
                    """
                    try {
                      if (typeof window.__datawiseClearOpenScreen === 'function') {
                        window.__datawiseClearOpenScreen();
                      } else {
                        var el = document.getElementById('dw-open-screen');
                        if (el && el.parentNode) el.parentNode.removeChild(el);
                      }
                    } catch (e) {}
                    """,
                    browser.getURL(),
                    0
            );
        } catch (Exception ignored) {
        }
    }

    private void applyBootSurface() {
        java.awt.Color bootBg = FramelessResizeSupport.bootBackground();
        setBackground(bootBg);
        getContentPane().setBackground(bootBg);
        if (bootCover != null) {
            bootCover.refreshColor();
        }
        try {
            JComponent ui = (JComponent) browser.getUIComponent();
            if (ui != null) {
                ui.setOpaque(true);
                ui.setBackground(bootBg);
            }
        } catch (Exception ignored) {
        }
    }

    /** 首屏 HTML 就绪后显示窗口（Shell 骨架由 Vue 绘制，不再等 notifyMounted） */
    public void showMainWindow() {
        applyBootSurface();
        revealRequested = true;
        if (revealed) {
            return;
        }
        tryRevealWindow();
        if (revealFallbackTimer != null) {
            revealFallbackTimer.stop();
        }
        revealFallbackTimer = new Timer(4_000, e -> {
            mainDocumentLoaded = true;
            tryRevealWindow();
        });
        revealFallbackTimer.setRepeats(false);
        revealFallbackTimer.start();
        // Safety: never leave open-screen forever if notifyBootReady is missed
        Timer openScreenFallback = new Timer(35_000, e -> onRendererBootReady());
        openScreenFallback.setRepeats(false);
        openScreenFallback.start();
    }

    private void tryRevealWindow() {
        if (!revealRequested || revealed) {
            return;
        }
        if (!mainDocumentLoaded) {
            return;
        }
        revealWhenReady();
    }

    /**
     * If the first SPA load failed (dev Vite down / transient error), retry once backend is healthy.
     */
    private void reloadRendererAfterBackendReady() {
        if (reloadedAfterBackendReady || browser == null) {
            return;
        }
        if (appRendererLoaded && spaLoadOk) {
            return;
        }
        reloadedAfterBackendReady = true;
        navigateToStartUrl("backend ready");
    }

    /** After backend is up, recover from transient CEF load failures (sleep/wake, port race). */
    private void scheduleLoadRetryAfterError() {
        if (browser == null || postReadyLoadRetries >= 3) {
            return;
        }
        if (loadRetryTimer != null) {
            loadRetryTimer.stop();
        }
        int attempt = postReadyLoadRetries + 1;
        loadRetryTimer = new Timer(1_200 * attempt, e -> {
            if (spaLoadOk || browser == null) {
                return;
            }
            postReadyLoadRetries = attempt;
            navigateToStartUrl("post-ready load retry #" + attempt);
        });
        loadRetryTimer.setRepeats(false);
        loadRetryTimer.start();
    }

    /**
     * HTML may load while {@code /src/main.ts} (or hashed assets) still fail after wake.
     * If Vue never marks mount, force one host-side reload.
     */
    private void scheduleMountWatchdog() {
        if (browser == null) {
            return;
        }
        if (mountWatchdogTimer != null) {
            mountWatchdogTimer.stop();
        }
        mountWatchdogTimer = new Timer(22_000, e -> {
            if (browser == null) {
                return;
            }
            try {
                browser.executeJavaScript(
                        """
                        (function () {
                          if (window.__DW_APP_MOUNTED__) return;
                          try {
                            var n = Number(sessionStorage.getItem('dw-boot-auto-reload') || '0');
                            if (!Number.isFinite(n)) n = 0;
                            sessionStorage.setItem('dw-boot-auto-reload', String(n + 1));
                          } catch (err) {}
                          location.reload();
                        })();
                        """,
                        browser.getURL(),
                        0
                );
            } catch (Exception ex) {
                System.err.println("[datawise-desktop] mount watchdog failed: " + ex.getMessage());
            }
        });
        mountWatchdogTimer.setRepeats(false);
        mountWatchdogTimer.start();
    }

    private void navigateToStartUrl(String reason) {
        if (browser == null) {
            return;
        }
        String target = startUrl != null && !startUrl.isBlank() ? startUrl : browser.getURL();
        System.out.println("[datawise-desktop] " + reason + " — loading renderer " + target);
        try {
            if (target != null && !target.isBlank() && !"about:blank".equalsIgnoreCase(target)) {
                spaLoadOk = false;
                browser.loadURL(target);
            } else {
                browser.reload();
            }
        } catch (Exception e) {
            System.err.println("[datawise-desktop] renderer navigate failed (" + reason + "): " + e.getMessage());
        }
    }

    private void revealWhenReady() {
        if (!revealRequested || revealed) {
            return;
        }
        revealed = true;
        if (revealFallbackTimer != null) {
            revealFallbackTimer.stop();
            revealFallbackTimer = null;
        }
        Runnable show = () -> {
            if (!isVisible()) {
                setVisible(true);
            }
            toFront();
            requestFocus();
            FramelessResizeSupport.notifyBrowserResized(browser, DesktopMainFrame.this);
            String url = browser.getURL();
            System.out.println("[datawise-desktop] show url=" + url);
            if (url == null || url.isBlank() || "about:blank".equalsIgnoreCase(url)) {
                browser.reload();
            }
            focusBrowser();
            DesktopBrowserZoom.restore(browser);
            bridge.pushSystemTheme();
        };
        if (SwingUtilities.isEventDispatchThread()) {
            show.run();
        } else {
            SwingUtilities.invokeLater(show);
        }
    }

    private void bindPersistHooks() {
        ComponentAdapter adapter = new ComponentAdapter() {
            @Override
            public void componentResized(ComponentEvent e) {
                schedulePersist();
            }

            @Override
            public void componentMoved(ComponentEvent e) {
                schedulePersist();
            }
        };
        addComponentListener(adapter);
    }

    private void schedulePersist() {
        if (persistTimer != null) {
            persistTimer.stop();
        }
        persistTimer = new Timer(400, e -> persistWindowStateNow());
        persistTimer.setRepeats(false);
        persistTimer.start();
    }

    private void persistWindowStateNow() {
        JsonObject state = bridge.chrome().snapshotState();
        WindowStateStore.write(state);
        bridge.push("datawise:window:state-changed", state);
    }

    public void shutdown() {
        if (bridge.isQuitting()) {
            return;
        }
        bridge.setQuitting(true);
        if (mountWatchdogTimer != null) {
            mountWatchdogTimer.stop();
            mountWatchdogTimer = null;
        }
        if (loadRetryTimer != null) {
            loadRetryTimer.stop();
            loadRetryTimer = null;
        }
        if (revealFallbackTimer != null) {
            revealFallbackTimer.stop();
            revealFallbackTimer = null;
        }

        // Hard exit must NOT rely on Swing Timer — CEF can block the EDT during dispose.
        // Allow time for workspace session flush + backend stop before force kill.
        Thread hardExit = new Thread(() -> {
            try {
                Thread.sleep(5_000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
            forceHostExit();
        }, "datawise-desktop-hard-exit");
        hardExit.setDaemon(true);
        hardExit.start();

        Runnable hideUi = () -> {
            try {
                setVisible(false);
            } catch (Exception ignored) {
            }
        };
        if (SwingUtilities.isEventDispatchThread()) {
            hideUi.run();
        } else {
            SwingUtilities.invokeLater(hideUi);
        }

        Thread cleanup = new Thread(this::performHostQuit, "datawise-desktop-quit");
        cleanup.setDaemon(false);
        cleanup.start();
    }

    private void performHostQuit() {
        // Persist open tabs before stopping the backend (beforeunload is unreliable in CEF).
        try {
            bridge.requestSessionFlushAndWait(2_500);
        } catch (Exception ignored) {
        }
        try {
            persistWindowStateNow();
        } catch (Exception ignored) {
        }
        // Release single-instance lock before CEF teardown so a relaunch is not blocked.
        try {
            singleInstanceGuard.close();
        } catch (Exception ignored) {
        }
        try {
            if (backend.isInProcess()) {
                backend.stopQuick();
            } else {
                backend.stop();
            }
        } catch (Exception ignored) {
        }
        // CEF dispose can hang forever on Windows — bound it, then exit.
        Thread dispose = new Thread(() -> {
            try {
                DesktopCefBootstrap.disposeQuietly();
            } catch (Exception ignored) {
            }
        }, "datawise-cef-dispose");
        dispose.setDaemon(true);
        dispose.start();
        try {
            dispose.join(1_500);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        System.exit(0);
        try {
            Thread.sleep(400);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        forceHostExit();
    }

    private void forceHostExit() {
        try {
            singleInstanceGuard.close();
        } catch (Exception ignored) {
        }
        Runtime.getRuntime().halt(0);
    }
}
