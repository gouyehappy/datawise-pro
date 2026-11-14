package org.apache.datawise.desktop.cef;

import org.apache.datawise.desktop.DesktopPaths;
import org.apache.datawise.desktop.ui.SplashTheme;
import org.cef.CefSettings;
import org.cef.OS;
import org.cef.callback.CefCommandLine;

import java.awt.GraphicsConfiguration;
import java.awt.GraphicsDevice;
import java.awt.GraphicsEnvironment;
import java.awt.Color;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Tunes CEF/Chromium for JetBrains JCEF under a JBR runtime with embedded CEF.
 */
public final class CefRuntimeConfig {
    private CefRuntimeConfig() {
    }

    public static void applySettings(CefSettings settings) {
        try {
            java.nio.file.Files.createDirectories(DesktopPaths.userDataDir().resolve("logs"));
            java.nio.file.Files.createDirectories(DesktopPaths.userDataDir().resolve("cef-cache"));
        } catch (Exception ignored) {
        }

        settings.windowless_rendering_enabled = false;
        settings.persist_session_cookies = true;
        settings.cache_path = DesktopPaths.userDataDir().resolve("cef-cache").toString();
        settings.log_file = DesktopPaths.userDataDir().resolve("logs").resolve("cef.log").toString();
        settings.user_agent_product = "DataWiseCLI/5.0.0";
        Color chrome = SplashTheme.awtChromeBackground();
        // ColorType(alpha, red, green, blue) — alpha must be >0 to enable (JCEF docs).
        // Previous bug passed (r,g,b,a) so Chromium kept the default white background.
        settings.background_color = settings.new ColorType(
                255,
                chrome.getRed(),
                chrome.getGreen(),
                chrome.getBlue()
        );

        String cefLog = System.getenv("DATAWISE_CEF_LOG");
        boolean verboseCefLog = cefLog != null
                && (cefLog.equals("1") || cefLog.equalsIgnoreCase("true") || cefLog.equalsIgnoreCase("error"));
        settings.log_severity = verboseCefLog
                ? CefSettings.LogSeverity.LOGSEVERITY_ERROR
                : CefSettings.LogSeverity.LOGSEVERITY_DISABLE;
    }

    /** Extra Chromium switches merged into JCefAppConfig app args. */
    public static String[] mergeAppArgs(String[] baseArgs) {
        List<String> args = new ArrayList<>();
        if (baseArgs != null) {
            args.addAll(Arrays.asList(baseArgs));
        }
        args.addAll(List.of(
                "--disable-background-networking",
                "--disable-background-timer-throttling",
                "--disable-backgrounding-occluded-windows",
                "--disable-breakpad",
                "--disable-client-side-phishing-detection",
                "--disable-component-update",
                "--disable-default-apps",
                "--disable-domain-reliability",
                "--disable-features="
                        + "AutofillServerCommunication,"
                        + "BackgroundFetch,"
                        + "BackgroundSync,"
                        + "CalculateNativeWinOcclusion,"
                        + "InterestFeedContentSuggestions,"
                        + "MediaRouter,"
                        + "OptimizationHints,"
                        + "PushMessaging,"
                        + "TranslateUI,"
                        + "WebGPU,"
                        + "Vulkan,"
                        + "OnDeviceModel,"
                        + "OnDeviceModelValidation,"
                        + "CrashReporting",
                "--disable-ipc-flooding-protection",
                "--disable-notifications",
                "--disable-renderer-backgrounding",
                "--disable-sync",
                "--disable-web-resources",
                "--gcm-checkin-url=http://127.0.0.1:9/",
                "--gcm-mcs-endpoint=127.0.0.1:9",
                "--gcm-registration-url=http://127.0.0.1:9/",
                "--log-level=3",
                "--metrics-recording-only",
                "--no-first-run",
                "--no-default-browser-check",
                "--no-pings",
                "--password-store=basic",
                "--use-mock-keychain"
        ));
        return args.toArray(String[]::new);
    }

    public static void applyCommandLine(CefCommandLine commandLine) {
        if (commandLine == null) {
            return;
        }
        applyGpuPolicy(commandLine);
        applyLinuxDeviceScale(commandLine);
    }

    /**
     * 全局 GPU 策略：默认开启合成，避免 Windows Alt+Tab 软件重绘导致密 DOM（资源树）闪烁。
     * {@code DATAWISE_CEF_DISABLE_GPU=1} 关闭；{@code DATAWISE_CEF_ENABLE_GPU=1} 可覆盖禁用。
     */
    static void applyGpuPolicy(CefCommandLine commandLine) {
        String enableGpu = System.getenv("DATAWISE_CEF_ENABLE_GPU");
        boolean forceOn = enableGpu != null
                && (enableGpu.equals("1") || enableGpu.equalsIgnoreCase("true"));
        String disableGpu = System.getenv("DATAWISE_CEF_DISABLE_GPU");
        boolean forceOff = disableGpu != null
                && (disableGpu.equals("1") || disableGpu.equalsIgnoreCase("true"));
        if (forceOff && !forceOn) {
            commandLine.appendSwitch("disable-gpu");
            commandLine.appendSwitch("disable-gpu-compositing");
            return;
        }
        if (OS.isWindows()) {
            commandLine.appendSwitchWithValue("use-angle", "d3d11");
        }
        commandLine.appendSwitch("enable-gpu-rasterization");
    }

    private static void applyLinuxDeviceScale(CefCommandLine commandLine) {
        if (!OS.isLinux()) {
            return;
        }
        try {
            GraphicsEnvironment ge = GraphicsEnvironment.getLocalGraphicsEnvironment();
            GraphicsDevice gd = ge.getDefaultScreenDevice();
            GraphicsConfiguration gc = gd.getDefaultConfiguration();
            double scale = gc != null ? gc.getDefaultTransform().getScaleX() : 1.0;
            if (scale > 1.0) {
                commandLine.appendSwitchWithValue("force-device-scale-factor", String.valueOf(scale));
            }
        } catch (Exception ignored) {
        }
    }
}
