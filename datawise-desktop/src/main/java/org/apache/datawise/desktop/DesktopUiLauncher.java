package org.apache.datawise.desktop;

import org.apache.datawise.desktop.backend.BackendProcessService;
import org.apache.datawise.desktop.bridge.DesktopBridgeScript;
import org.apache.datawise.desktop.cef.DesktopCefBootstrap;
import org.apache.datawise.desktop.deeplink.SingleInstanceGuard;
import org.apache.datawise.desktop.integration.DesktopIntegration;
import org.apache.datawise.desktop.protocol.WindowsProtocolRegistrar;
import org.apache.datawise.desktop.startup.DesktopStartupTiming;
import org.apache.datawise.desktop.tray.SystemTrayService;
import org.apache.datawise.desktop.staticserver.RendererStaticServer;
import org.apache.datawise.desktop.ui.DesktopLookAndFeel;
import org.apache.datawise.desktop.ui.DesktopMainFrame;
import org.apache.datawise.desktop.updater.DesktopUpdaterService;

import javax.swing.SwingUtilities;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Starts the JCEF UI in the same JVM as Spring Boot.
 *
 * <p>Call {@link #prepareAndStart(String[])} before {@code SpringApplication.run}.
 * Configures {@code datawise.config.dir} and opens CEF against the local API origin.
 */
public final class DesktopUiLauncher {
    private static volatile BackendProcessService backend;
    private static volatile SingleInstanceGuard guard;
    private static volatile DesktopMainFrame frame;
    private static volatile RendererStaticServer staticServer;

    private DesktopUiLauncher() {
    }

    public static boolean isGuiRequested() {
        if (Boolean.parseBoolean(System.getProperty("datawise.gui", "false"))) {
            return true;
        }
        String env = System.getenv("DATAWISE_GUI");
        if (env != null && (env.equalsIgnoreCase("1") || env.equalsIgnoreCase("true"))) {
            return true;
        }
        // Packaged desktop always shows GUI unless explicitly disabled.
        if (Boolean.parseBoolean(System.getProperty("datawise.packaged", "false"))) {
            String guiOff = System.getProperty("datawise.gui", "");
            return !"false".equalsIgnoreCase(guiOff);
        }
        String packagedEnv = System.getenv("DATAWISE_PACKAGED");
        return packagedEnv != null
                && (packagedEnv.equalsIgnoreCase("1") || packagedEnv.equalsIgnoreCase("true"));
    }

    /**
     * Bootstrap workspace config, single-instance, CEF window; return Spring argv extras.
     */
    public static String[] prepareAndStart(String[] args) throws Exception {
        DesktopStartupTiming.markProcessStart();
        System.setProperty("java.awt.headless", "false");
        System.setProperty("datawise.gui", "true");
        // Warm paint-critical chrome only (shell zoom migrate deferred until CEF restore).
        org.apache.datawise.desktop.prefs.DesktopChromeStore.paintSnapshot();

        guard = new SingleInstanceGuard();
        if (!guard.tryAcquire()) {
            SingleInstanceGuard.notifyRunningInstance(args);
            System.err.println("[datawise-desktop] another instance is running; exiting");
            System.exit(0);
        }
        if (args != null) {
            for (String arg : args) {
                if (arg != null && arg.startsWith("datawise://")) {
                    guard.enqueueDeepLink(arg);
                }
            }
        }
        guard.startInboxPoller();

        boolean packaged = Boolean.parseBoolean(System.getProperty("datawise.packaged", "false"))
                || Boolean.parseBoolean(System.getenv().getOrDefault("DATAWISE_PACKAGED", "false"));
        backend = new BackendProcessService(packaged, true);

        Path configDir = backend.resolveRuntimeConfigDir();
        boolean seeded = backend.bootstrapConfigDirectory(configDir);
        DesktopStartupTiming.markConfigReady(configDir, seeded);
        String absoluteConfig = configDir.toAbsolutePath().normalize().toString();
        Path logsDir = configDir.resolve("logs");
        System.setProperty("datawise.config.dir", absoluteConfig);
        // logback-spring 读 datawise.logging.dir；必须在 Spring 启动前落到工作区，否则会写到 JVM cwd。
        System.setProperty("datawise.logging.dir", logsDir.toAbsolutePath().normalize().toString());

        String platform = resolvePlatform();
        String apiBaseUrl = backend.getApiBaseUrl();
        String bridgeScript = DesktopBridgeScript.build(
                platform, apiBaseUrl, DesktopUpdaterService.resolveCurrentVersion(), packaged);

        String rendererUrl = resolveRendererUrl(packaged, apiBaseUrl, bridgeScript);
        System.out.println("[datawise-desktop] same-JVM gui renderer=" + rendererUrl
                + " api=" + apiBaseUrl + " configDir=" + configDir);

        try {
            WindowsProtocolRegistrar.registerIfWindows(DesktopPaths.resolveWindowsLauncher());
        } catch (Exception e) {
            System.err.println("[datawise-desktop] protocol register skipped: " + e.getMessage());
        }
        try {
            WindowsAppBranding.applyIfWindows(DesktopPaths.installRoot(), DesktopPaths.resolveWindowsLauncher());
        } catch (Exception e) {
            System.err.println("[datawise-desktop] branding skipped: " + e.getMessage());
        }

        DesktopLookAndFeel.install();
        DesktopAppIcons.appIconSizes();

        // Warm CEF early (before Spring / EDT); health poll runs in background.
        backend.startInBackground();
        DesktopCefBootstrap.ensureStarted(args);
        DesktopStartupTiming.markCefReady();

        DesktopUpdaterService updater = new DesktopUpdaterService();
        CountDownLatch frameReady = new CountDownLatch(1);
        AtomicReference<Exception> frameError = new AtomicReference<>();

        SwingUtilities.invokeLater(() -> {
            try {
                SystemTrayService[] trayHolder = new SystemTrayService[1];
                frame = new DesktopMainFrame(
                        rendererUrl,
                        platform,
                        bridgeScript,
                        backend,
                        updater,
                        guard,
                        () -> trayHolder[0] != null && trayHolder[0].handleWindowClosing()
                );
                trayHolder[0] = new SystemTrayService(
                        frame,
                        () -> frame.bridge().isQuitting(),
                        frame::shutdown);
                trayHolder[0].install();
                guard.setSecondInstanceHandler(urls -> SwingUtilities.invokeLater(() -> {
                    trayHolder[0].showMain();
                    for (String url : urls) {
                        if (SingleInstanceGuard.ACTIVATE_TOKEN.equals(url)) {
                            continue;
                        }
                        frame.bridge().pushDeepLink(url);
                    }
                }));
                frame.showMainWindow();
                DesktopStartupTiming.markWindowShown();
                DesktopIntegration.install(frame, frame.bridge(), guard);
                pushStartupFileArgs(frame, args);
            } catch (Exception e) {
                frameError.set(e);
            } finally {
                frameReady.countDown();
            }
        });

        if (!frameReady.await(180, TimeUnit.SECONDS)) {
            throw new IllegalStateException("Main window initialization timed out");
        }
        if (frameError.get() != null) {
            throw frameError.get();
        }

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            try {
                DesktopCefBootstrap.disposeQuietly();
            } catch (Exception ignored) {
            }
            if (staticServer != null) {
                staticServer.close();
            }
            if (guard != null) {
                guard.close();
            }
        }, "datawise-desktop-shutdown"));

        return buildSpringArgs(args, configDir, packaged);
    }

    private static String[] buildSpringArgs(String[] args, Path configDir, boolean packaged) {
        java.util.ArrayList<String> out = new java.util.ArrayList<>();
        if (args != null) {
            for (String a : args) {
                if (a != null && !a.isBlank()) {
                    out.add(a);
                }
            }
        }
        String abs = configDir.toAbsolutePath().normalize().toString();
        String logs = configDir.resolve("logs").toAbsolutePath().normalize().toString();
        out.add("--datawise.config.dir=" + abs);
        out.add("--datawise.logging.dir=" + logs);
        out.add("--server.address=127.0.0.1");
        out.add("--server.port=" + (packaged
                ? DesktopRuntimePorts.desktopBackend()
                : DesktopRuntimePorts.devBackend()));
        boolean hasProfile = out.stream().anyMatch(a -> a.startsWith("--spring.profiles.active"));
        if (!hasProfile) {
            out.add("--spring.profiles.active=" + (packaged ? "desktop" : "dev"));
        }
        return out.toArray(String[]::new);
    }

    private static String resolveRendererUrl(boolean packaged, String apiBaseUrl, String bridgeScript)
            throws java.io.IOException {
        String override = System.getenv("DATAWISE_RENDERER_URL");
        if (override != null && !override.isBlank()) {
            return override.trim();
        }
        if (!packaged) {
            return "http://127.0.0.1:" + DesktopRuntimePorts.devFrontend() + "/";
        }
        // Serve frontend-dist before Spring is up — one SPA document, no data-URL boot splash hop.
        Path dist = DesktopPaths.frontendDistRoot();
        staticServer = new RendererStaticServer(dist);
        staticServer.setBridgeScript(bridgeScript);
        // Same-origin /api for community-plugin workbench iframes (see RendererStaticServer).
        staticServer.setApiProxyBase(apiBaseUrl);
        return staticServer.start(DesktopRuntimePorts.desktopFrontend());
    }

    private static String resolvePlatform() {
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        if (os.contains("win")) {
            return "win32";
        }
        if (os.contains("mac")) {
            System.setProperty("apple.awt.application.name", "DataWise CLI");
            return "darwin";
        }
        return "linux";
    }

    private static void pushStartupFileArgs(DesktopMainFrame frame, String[] args) {
        if (args == null || frame == null) {
            return;
        }
        for (String arg : args) {
            if (arg == null || arg.isBlank() || arg.startsWith("-") || arg.startsWith("datawise:")) {
                continue;
            }
            try {
                Path path = Path.of(arg);
                if (Files.isRegularFile(path)) {
                    frame.bridge().pushOpenFile(path.toAbsolutePath().normalize().toString());
                }
            } catch (Exception ignored) {
            }
        }
    }
}
