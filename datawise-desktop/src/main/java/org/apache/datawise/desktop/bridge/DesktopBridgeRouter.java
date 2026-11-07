package org.apache.datawise.desktop.bridge;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.apache.datawise.desktop.backend.BackendProcessService;
import org.apache.datawise.desktop.deeplink.DeepLinkParser;
import org.apache.datawise.desktop.deeplink.SingleInstanceGuard;
import org.apache.datawise.desktop.prefs.DesktopPreferencesStore;
import org.apache.datawise.desktop.prefs.RendererUiStore;
import org.apache.datawise.desktop.prefs.RuntimeJsonStore;
import org.apache.datawise.desktop.prefs.WindowStateStore;
import org.apache.datawise.desktop.prefs.WorkspacePreferences;
import org.apache.datawise.desktop.process.ProcessRelauncher;
import org.apache.datawise.desktop.updater.DesktopUpdaterService;
import org.apache.datawise.desktop.ui.WindowChromeController;
import org.apache.datawise.desktop.util.DesktopFsUtil;
import org.apache.datawise.desktop.util.DesktopGitUtil;
import org.apache.datawise.desktop.util.DesktopPathSandbox;
import org.apache.datawise.desktop.util.SystemThemeUtil;
import org.cef.browser.CefBrowser;
import org.cef.browser.CefFrame;
import org.cef.callback.CefQueryCallback;
import org.cef.handler.CefMessageRouterHandlerAdapter;

import javax.swing.JFileChooser;
import javax.swing.JFrame;
import javax.swing.SwingUtilities;
import java.awt.Desktop;
import java.awt.Toolkit;
import java.awt.datatransfer.DataFlavor;
import java.awt.datatransfer.StringSelection;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Handles {@code cefQuery} requests for the desktop bridge (window / fs / updater / …).
 */
public final class DesktopBridgeRouter extends CefMessageRouterHandlerAdapter {
    private final Gson gson = new Gson();
    private final JFrame frame;
    private final BackendProcessService backend;
    private final DesktopUpdaterService updater;
    private final SingleInstanceGuard singleInstance;
    private final AtomicReference<CefBrowser> browserRef = new AtomicReference<>();
    private final WindowChromeController chrome;
    private final DesktopPathSandbox pathSandbox = new DesktopPathSandbox();
    private volatile boolean quitting;
    private final Runnable refocusBrowser;
    private volatile CountDownLatch sessionFlushLatch;

    public DesktopBridgeRouter(
            JFrame frame,
            BackendProcessService backend,
            DesktopUpdaterService updater,
            SingleInstanceGuard singleInstance,
            Runnable refocusBrowser
    ) {
        this.frame = frame;
        this.backend = backend;
        this.updater = updater;
        this.singleInstance = singleInstance;
        this.refocusBrowser = refocusBrowser != null ? refocusBrowser : () -> {};
        this.chrome = new WindowChromeController(frame, maximized ->
                push("datawise:window:maximize-changed", maximized));
        this.backend.addListener(event -> push("datawise:backend:startup-progress", gson.toJsonTree(event).getAsJsonObject()));
        this.updater.addListener(event -> push("datawise:updater:status", event));
    }

    public void bindBrowser(CefBrowser browser) {
        browserRef.set(browser);
    }

    public WindowChromeController chrome() {
        return chrome;
    }

    public void setQuitting(boolean quitting) {
        this.quitting = quitting;
    }

    public boolean isQuitting() {
        return quitting;
    }

    @Override
    public boolean onQuery(
            CefBrowser browser,
            CefFrame frame,
            long queryId,
            String request,
            boolean persistent,
            CefQueryCallback callback
    ) {
        try {
            JsonObject body = JsonParser.parseString(request).getAsJsonObject();
            String channel = body.get("channel").getAsString();
            JsonArray args = body.has("args") && body.get("args").isJsonArray()
                    ? body.getAsJsonArray("args")
                    : new JsonArray();

            // Folder picker must NOT block the CEF thread (modal + latch deadlocks / never returns).
            if ("config:pickDirectory".equals(channel)) {
                pickDirectoryAsync(callback, false);
                return true;
            }
            if ("fs:selectDirectory".equals(channel)) {
                pickDirectoryAsync(callback, true);
                return true;
            }
            if ("fs:selectFile".equals(channel)) {
                pickFileAsync(callback, argString(args, 0));
                return true;
            }
            if ("fs:selectSaveFile".equals(channel)) {
                selectSaveFileAsync(callback, argString(args, 0), argString(args, 1));
                return true;
            }

            Object result = dispatch(channel, args);
            callback.success(gson.toJson(result));
        } catch (Exception e) {
            JsonObject err = new JsonObject();
            err.addProperty("__error", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
            callback.success(gson.toJson(err));
        }
        return true;
    }

    private Object dispatch(String channel, JsonArray args) throws Exception {
        return switch (channel) {
            case "window:getState" -> chrome.snapshotState();
            case "window:setState" -> {
                if (args.size() > 0 && args.get(0).isJsonObject()) {
                    JsonObject state = args.get(0).getAsJsonObject().deepCopy();
                    chrome.applyState(state);
                    WindowStateStore.write(state);
                    push("datawise:window:state-changed", state);
                }
                yield true;
            }
            case "window:minimize" -> {
                chrome.minimize();
                yield true;
            }
            case "window:toggleMaximize" -> {
                chrome.toggleMaximize();
                yield true;
            }
            case "window:close" -> {
                chrome.close();
                yield true;
            }
            case "app:sessionFlushed" -> {
                CountDownLatch latch = sessionFlushLatch;
                if (latch != null) {
                    latch.countDown();
                }
                yield true;
            }
            case "window:isMaximized" -> chrome.isMaximized();
            case "window:startDrag" -> chrome.startDrag(argInt(args, 0, 0), argInt(args, 1, 0));
            case "window:dragTo" -> true; // legacy no-op; drag is polled on EDT
            case "window:endDrag" -> {
                chrome.endDrag();
                yield true;
            }
            case "updater:checkForUpdates" -> updater.checkForUpdates();
            case "updater:downloadUpdate" -> updater.downloadUpdate();
            case "updater:quitAndInstall" -> {
                boolean ok = updater.quitAndInstall();
                if (ok) {
                    SwingUtilities.invokeLater(() -> {
                        quitting = true;
                        try {
                            backend.stop();
                        } catch (Exception ignored) {
                        }
                        System.exit(0);
                    });
                }
                yield ok;
            }
            case "updater:setPreferences" -> {
                if (args.size() > 0 && args.get(0).isJsonObject()) {
                    JsonObject prefs = args.get(0).getAsJsonObject();
                    updater.setPreferences(
                            !prefs.has("notifyOnUpdate") || prefs.get("notifyOnUpdate").getAsBoolean(),
                            prefs.has("autoDownload") && prefs.get("autoDownload").getAsBoolean());
                }
                yield true;
            }
            case "updater:getStatus" -> updater.getStatus();
            case "config:getSettings" -> configGetSettings();
            case "config:clearRuntimeSetupPending" -> {
                Path resolved = backend.resolveRuntimeConfigDir();
                RuntimeJsonStore.clearSetupPending(resolved);
                DesktopPreferencesStore.setRuntimeSetupPending(false);
                yield true;
            }
            case "config:getJrePreferences" -> effectiveJrePrefs(backend.resolveRuntimeConfigDir());
            case "config:setJrePreferences" -> setJrePreferences(
                    args.size() > 0 && args.get(0).isJsonObject() ? args.get(0).getAsJsonObject() : new JsonObject()
            );
            case "config:pickDirectory" -> throw new IllegalStateException("handled async");
            case "config:applyAndRestart" -> {
                String configDir = argString(args, 0);
                applyConfigDir(configDir);
                restartHost();
                yield true;
            }
            case "config:switchWorkspace" -> {
                String path = argString(args, 0);
                applyConfigDir(path);
                restartHost();
                yield true;
            }
            case "config:removeRecentWorkspace" -> {
                String path = argString(args, 0);
                DesktopPreferencesStore.removeRecent(path);
                yield WorkspacePreferences.buildWorkspaceList(
                        backend.resolveRuntimeConfigDir().toString(),
                        backend.resolveDefaultConfigDir().toString());
            }
            case "config:createWorkspace" -> WorkspacePreferences.prepareNewWorkspace(argString(args, 0));
            case "config:resolvePath" -> backend.resolveConfiguredConfigPath(argString(args, 0)).toString();
            case "deep-link:flushPending" -> flushDeepLink();
            case "logs:openRuntime" -> openRuntimeLog();
            case "backend:getStartupState" -> gson.toJsonTree(backend.getStartupState()).getAsJsonObject();
            case "uiStore:persist" -> {
                if (args.size() > 0 && args.get(0).isJsonObject()) {
                    JsonObject patch = args.get(0).getAsJsonObject();
                    RendererUiStore.write(patch);
                    // Canonical chrome keys (theme* accepted as legacy aliases).
                    boolean themePatch = patch.has("appearance")
                            || patch.has("background")
                            || patch.has("primary")
                            || patch.has("uiSkin")
                            || patch.has("uiFont")
                            || patch.has("uiTextScale")
                            || patch.has("uiDensity")
                            || patch.has("themeAppearance")
                            || patch.has("themeBackground")
                            || patch.has("themePrimary")
                            || patch.has("themeUiSkin")
                            || patch.has("themeUiFont")
                            || patch.has("themeUiTextScale")
                            || patch.has("themeUiDensity");
                    boolean shellPatch = patch.has("locale")
                            || patch.has("zoomLevel")
                            || patch.has("editorFontSize")
                            || patch.has("editorFontFamily");
                    if (themePatch || shellPatch) {
                        // Machine last-write chrome / shell prefs (not per app login user).
                        org.apache.datawise.desktop.prefs.DesktopChromeStore.writePatch(patch);
                        if (themePatch && frame instanceof org.apache.datawise.desktop.ui.DesktopMainFrame main) {
                            main.applyThemeSurfaceFromHostPrefs();
                        }
                    }
                }
                yield true;
            }
            case "uiStore:clearSession" -> {
                RendererUiStore.clearSessionKeys();
                yield true;
            }
            case "fs:revealInExplorer" -> revealInExplorer(argString(args, 0));
            case "fs:readTextFile" -> readTextFile(argString(args, 0));
            case "fs:readFileDataUrl" -> readFileDataUrl(argString(args, 0));
            case "fs:gitStatus" -> gitStatus(argString(args, 0));
            case "fs:gitDiff" -> gitDiff(argString(args, 0));
            case "fs:writeTextFile" -> writeTextFile(argString(args, 0), argString(args, 1));
            case "fs:writeBinaryFile" -> writeBinaryFile(argString(args, 0), argString(args, 1));
            case "fs:listDir" -> listDir(argString(args, 0), argBool(args, 1, false));
            case "fs:stat" -> statPath(argString(args, 0));
            case "fs:mkdir" -> mkdir(argString(args, 0));
            case "fs:rename" -> renamePath(argString(args, 0), argString(args, 1));
            case "fs:delete" -> deletePath(argString(args, 0), argBool(args, 1, false));
            case "fs:openInTerminal" -> openInTerminal(argString(args, 0));
            case "fs:registerRoot" -> registerRoot(argString(args, 0));
            case "browser:setZoomLevel" -> {
                setBrowserZoom(argDouble(args, 0, 0.0));
                yield true;
            }
            case "browser:getZoomLevel" -> getBrowserZoom();
            case "clipboard:readText" -> readClipboardText();
            case "clipboard:writeText" -> {
                writeClipboardText(argString(args, 0));
                yield true;
            }
            case "shell:openExternal" -> {
                DesktopFsUtil.openExternal(argString(args, 0));
                yield true;
            }
            case "shell:setOpenHttpLinksIn" -> {
                org.apache.datawise.desktop.prefs.DesktopOpenLinksPrefs.setFromClientValue(argString(args, 0));
                yield true;
            }
            case "theme:getSystemAppearance" -> systemAppearance();
            case "devtools:toggle" -> {
                toggleDevTools();
                yield true;
            }
            case "app:notifyMounted" -> {
                if (frame instanceof org.apache.datawise.desktop.ui.DesktopMainFrame main) {
                    main.onRendererAppMounted();
                }
                yield true;
            }
            case "app:notifyBootReady" -> {
                if (frame instanceof org.apache.datawise.desktop.ui.DesktopMainFrame main) {
                    main.onRendererBootReady();
                }
                yield true;
            }
            default -> throw new IllegalArgumentException("Unknown bridge channel: " + channel);
        };
    }

    private void toggleDevTools() {
        if (frame instanceof org.apache.datawise.desktop.ui.DesktopMainFrame main) {
            main.toggleDevTools();
        }
    }

    public void openRuntimeLogFromMenu() {
        openRuntimeLog();
    }

    public void pushSystemTheme() {
        // Refresh chrome colors when preference is system; never overwrite appearance=system.
        org.apache.datawise.desktop.prefs.DesktopChromeStore.Snapshot snap =
                org.apache.datawise.desktop.prefs.DesktopChromeStore.refreshResolvedModeFromOs();
        JsonObject payload = new JsonObject();
        payload.addProperty("appearance", snap.resolvedMode());
        payload.addProperty("resolvedMode", snap.resolvedMode());
        payload.addProperty("chromeBg", snap.chromeBg());
        push("datawise:theme:system-changed", payload);
        javax.swing.SwingUtilities.invokeLater(() -> {
            org.apache.datawise.desktop.ui.DesktopLookAndFeel.applySystemAppearance();
            if (frame instanceof org.apache.datawise.desktop.ui.DesktopMainFrame main) {
                main.applyThemeSurfaceFromHostPrefs();
            }
        });
    }

    public void pushOpenFile(String absolutePath) {
        if (absolutePath == null || absolutePath.isBlank()) {
            return;
        }
        try {
            pathSandbox.allowOneShot(Path.of(absolutePath));
        } catch (Exception ignored) {
        }
        JsonObject payload = new JsonObject();
        payload.addProperty("path", absolutePath);
        String lower = absolutePath.toLowerCase();
        if (lower.endsWith(".sql")) {
            payload.addProperty("kind", "sql");
        } else if (lower.endsWith(".dwp")) {
            payload.addProperty("kind", "dwp");
        } else {
            payload.addProperty("kind", "file");
        }
        push("datawise:file:open", payload);
    }

    public void pushExternalUri(String uri) {
        JsonObject payload = new JsonObject();
        payload.addProperty("uri", uri);
        push("datawise:shell:external-uri", payload);
    }

    private JsonObject registerRoot(String pathStr) {
        JsonObject out = new JsonObject();
        if (pathStr == null || pathStr.isBlank()) {
            out.addProperty("ok", false);
            out.addProperty("error", "empty_path");
            return out;
        }
        try {
            Path root = pathSandbox.registerRoot(Path.of(pathStr));
            out.addProperty("ok", true);
            out.addProperty("path", root.toString());
        } catch (Exception e) {
            out.addProperty("ok", false);
            out.addProperty("error", e.getMessage() == null ? "register_failed" : e.getMessage());
        }
        return out;
    }

    private JsonObject revealInExplorer(String pathStr) {
        JsonObject out = new JsonObject();
        if (pathStr == null || pathStr.isBlank()) {
            out.addProperty("ok", false);
            out.addProperty("error", "empty_path");
            return out;
        }
        try {
            DesktopFsUtil.revealInExplorer(Path.of(pathStr));
            out.addProperty("ok", true);
        } catch (Exception e) {
            out.addProperty("ok", false);
            out.addProperty("error", e.getMessage() == null ? "reveal_failed" : e.getMessage());
        }
        return out;
    }

    private JsonObject readTextFile(String pathStr) throws Exception {
        JsonObject out = new JsonObject();
        if (pathStr == null || pathStr.isBlank()) {
            out.addProperty("ok", false);
            out.addProperty("error", "empty_path");
            return out;
        }
        Path path = pathSandbox.requireAllowed(Path.of(pathStr));
        String text = DesktopFsUtil.readTextFile(path);
        out.addProperty("ok", true);
        out.addProperty("path", path.toString());
        out.addProperty("content", text);
        return out;
    }

    private JsonObject readFileDataUrl(String pathStr) {
        JsonObject out = new JsonObject();
        if (pathStr == null || pathStr.isBlank()) {
            out.addProperty("ok", false);
            out.addProperty("error", "empty_path");
            return out;
        }
        try {
            Path path = pathSandbox.requireAllowed(Path.of(pathStr));
            String dataUrl = DesktopFsUtil.readFileDataUrl(path);
            out.addProperty("ok", true);
            out.addProperty("path", path.toString());
            out.addProperty("dataUrl", dataUrl);
        } catch (Exception e) {
            out.addProperty("ok", false);
            out.addProperty("error", e.getMessage() == null ? "read_failed" : e.getMessage());
        }
        return out;
    }

    private JsonObject gitStatus(String pathStr) {
        JsonObject out = new JsonObject();
        if (pathStr == null || pathStr.isBlank()) {
            out.addProperty("ok", false);
            out.addProperty("error", "empty_path");
            return out;
        }
        try {
            Path path = pathSandbox.requireAllowed(Path.of(pathStr));
            return DesktopGitUtil.status(path);
        } catch (Exception e) {
            out.addProperty("ok", false);
            out.addProperty("error", e.getMessage() == null ? "git_failed" : e.getMessage());
            return out;
        }
    }

    private JsonObject gitDiff(String pathStr) {
        JsonObject out = new JsonObject();
        if (pathStr == null || pathStr.isBlank()) {
            out.addProperty("ok", false);
            out.addProperty("error", "empty_path");
            return out;
        }
        try {
            Path path = pathSandbox.requireAllowed(Path.of(pathStr));
            return DesktopGitUtil.fileDiff(path);
        } catch (Exception e) {
            out.addProperty("ok", false);
            out.addProperty("error", e.getMessage() == null ? "git_failed" : e.getMessage());
            return out;
        }
    }

    private JsonObject writeTextFile(String pathStr, String content) {
        JsonObject out = new JsonObject();
        if (pathStr == null || pathStr.isBlank()) {
            out.addProperty("ok", false);
            out.addProperty("error", "empty_path");
            return out;
        }
        try {
            Path path = pathSandbox.requireAllowed(Path.of(pathStr));
            DesktopFsUtil.writeTextFile(path, content);
            out.addProperty("ok", true);
            out.addProperty("path", path.toString());
        } catch (Exception e) {
            out.addProperty("ok", false);
            out.addProperty("error", e.getMessage() == null ? "write_failed" : e.getMessage());
        }
        return out;
    }

    private JsonObject writeBinaryFile(String pathStr, String base64) {
        JsonObject out = new JsonObject();
        if (pathStr == null || pathStr.isBlank()) {
            out.addProperty("ok", false);
            out.addProperty("error", "empty_path");
            return out;
        }
        try {
            Path path = pathSandbox.requireAllowed(Path.of(pathStr));
            DesktopFsUtil.writeBinaryBase64(path, base64);
            out.addProperty("ok", true);
            out.addProperty("path", path.toString());
        } catch (Exception e) {
            out.addProperty("ok", false);
            out.addProperty("error", e.getMessage() == null ? "write_failed" : e.getMessage());
        }
        return out;
    }

    private JsonObject listDir(String pathStr, boolean includeHidden) {
        JsonObject out = new JsonObject();
        if (pathStr == null || pathStr.isBlank()) {
            out.addProperty("ok", false);
            out.addProperty("error", "empty_path");
            return out;
        }
        try {
            Path path = pathSandbox.requireAllowed(Path.of(pathStr));
            out.addProperty("ok", true);
            out.addProperty("path", path.toString());
            out.add("entries", DesktopFsUtil.listDir(path, includeHidden));
        } catch (Exception e) {
            out.addProperty("ok", false);
            out.addProperty("error", e.getMessage() == null ? "list_failed" : e.getMessage());
        }
        return out;
    }

    private JsonObject statPath(String pathStr) {
        JsonObject out = new JsonObject();
        if (pathStr == null || pathStr.isBlank()) {
            out.addProperty("ok", false);
            out.addProperty("error", "empty_path");
            return out;
        }
        try {
            Path path = pathSandbox.requireAllowed(Path.of(pathStr));
            JsonObject stat = DesktopFsUtil.stat(path);
            out.addProperty("ok", true);
            out.add("stat", stat);
        } catch (Exception e) {
            out.addProperty("ok", false);
            out.addProperty("error", e.getMessage() == null ? "stat_failed" : e.getMessage());
        }
        return out;
    }

    private JsonObject mkdir(String pathStr) {
        JsonObject out = new JsonObject();
        if (pathStr == null || pathStr.isBlank()) {
            out.addProperty("ok", false);
            out.addProperty("error", "empty_path");
            return out;
        }
        try {
            Path path = pathSandbox.requireAllowed(Path.of(pathStr));
            Path created = DesktopFsUtil.mkdir(path);
            out.addProperty("ok", true);
            out.addProperty("path", created.toAbsolutePath().normalize().toString());
        } catch (Exception e) {
            out.addProperty("ok", false);
            out.addProperty("error", e.getMessage() == null ? "mkdir_failed" : e.getMessage());
        }
        return out;
    }

    private JsonObject renamePath(String sourceStr, String targetStr) {
        JsonObject out = new JsonObject();
        if (sourceStr == null || sourceStr.isBlank() || targetStr == null || targetStr.isBlank()) {
            out.addProperty("ok", false);
            out.addProperty("error", "empty_path");
            return out;
        }
        try {
            Path source = pathSandbox.requireAllowed(Path.of(sourceStr));
            Path target = pathSandbox.requireAllowed(Path.of(targetStr));
            DesktopFsUtil.rename(source, target);
            out.addProperty("ok", true);
            out.addProperty("path", target.toString());
        } catch (Exception e) {
            out.addProperty("ok", false);
            out.addProperty("error", e.getMessage() == null ? "rename_failed" : e.getMessage());
        }
        return out;
    }

    private JsonObject deletePath(String pathStr, boolean recursive) {
        JsonObject out = new JsonObject();
        if (pathStr == null || pathStr.isBlank()) {
            out.addProperty("ok", false);
            out.addProperty("error", "empty_path");
            return out;
        }
        try {
            Path path = pathSandbox.requireAllowed(Path.of(pathStr));
            DesktopFsUtil.delete(path, recursive);
            out.addProperty("ok", true);
        } catch (Exception e) {
            out.addProperty("ok", false);
            out.addProperty("error", e.getMessage() == null ? "delete_failed" : e.getMessage());
        }
        return out;
    }

    private JsonObject openInTerminal(String pathStr) {
        JsonObject out = new JsonObject();
        if (pathStr == null || pathStr.isBlank()) {
            out.addProperty("ok", false);
            out.addProperty("error", "empty_path");
            return out;
        }
        try {
            Path path = pathSandbox.requireAllowed(Path.of(pathStr));
            DesktopFsUtil.openInTerminal(path);
            out.addProperty("ok", true);
        } catch (Exception e) {
            out.addProperty("ok", false);
            out.addProperty("error", e.getMessage() == null ? "terminal_failed" : e.getMessage());
        }
        return out;
    }

    private void setBrowserZoom(double level) {
        CefBrowser browser = browserRef.get();
        if (browser != null) {
            double clamped = Math.max(
                    org.apache.datawise.desktop.ui.DesktopBrowserZoom.MIN,
                    Math.min(org.apache.datawise.desktop.ui.DesktopBrowserZoom.MAX, level)
            );
            browser.setZoomLevel(clamped);
            org.apache.datawise.desktop.ui.DesktopBrowserZoom.persistZoom(clamped);
        }
    }

    private double getBrowserZoom() {
        CefBrowser browser = browserRef.get();
        return browser != null ? browser.getZoomLevel() : 0.0;
    }

    private String readClipboardText() throws Exception {
        if (!Toolkit.getDefaultToolkit().getSystemClipboard().isDataFlavorAvailable(DataFlavor.stringFlavor)) {
            return "";
        }
        Object data = Toolkit.getDefaultToolkit().getSystemClipboard().getData(DataFlavor.stringFlavor);
        return data == null ? "" : data.toString();
    }

    private void writeClipboardText(String text) {
        String value = text == null ? "" : text;
        Toolkit.getDefaultToolkit().getSystemClipboard().setContents(new StringSelection(value), null);
    }

    private JsonObject systemAppearance() {
        JsonObject out = new JsonObject();
        out.addProperty("appearance", SystemThemeUtil.resolveAppearance());
        return out;
    }

    private JsonObject configGetSettings() {
        Path resolved = backend.resolveRuntimeConfigDir();
        Path defaultPath = backend.resolveDefaultConfigDir();
        String configured = DesktopPreferencesStore.configDirOrNull();
        JsonObject out = new JsonObject();
        out.addProperty("configured", configured);
        out.addProperty("resolved", resolved.toString());
        out.addProperty("defaultPath", defaultPath.toString());
        out.addProperty("canChange", true);
        out.add("recentWorkspaces", gson.toJsonTree(
                WorkspacePreferences.buildWorkspaceList(resolved.toString(), defaultPath.toString())));
        boolean pending = DesktopPreferencesStore.runtimeSetupPending()
                || RuntimeJsonStore.isSetupPending(resolved);
        out.addProperty("runtimeSetupPending", pending);
        out.add("jre", effectiveJrePrefs(resolved));
        return out;
    }

    private JsonObject effectiveJrePrefs(Path configDir) {
        String source = RuntimeJsonStore.jreSource(configDir);
        if (source == null || source.isBlank()) {
            source = DesktopPreferencesStore.jreSourceOrNull();
        }
        if (source == null || source.isBlank() || "bundled-jlink".equalsIgnoreCase(source)) {
            source = "bundled";
        }
        String customHome = RuntimeJsonStore.jreCustomHome(configDir);
        if (customHome == null) {
            customHome = DesktopPreferencesStore.jreCustomHomeOrNull();
        }
        JsonObject jre = new JsonObject();
        jre.addProperty("source", source.trim().toLowerCase());
        if (customHome == null) {
            jre.add("customHome", null);
        } else {
            jre.addProperty("customHome", customHome);
        }
        return jre;
    }

    private JsonObject setJrePreferences(JsonObject patch) {
        Path configDir = backend.resolveRuntimeConfigDir();
        JsonObject current = effectiveJrePrefs(configDir);
        String source = current.get("source").getAsString();
        String customHome = current.has("customHome") && !current.get("customHome").isJsonNull()
                ? current.get("customHome").getAsString()
                : null;
        if (patch != null) {
            if (patch.has("source") && !patch.get("source").isJsonNull()) {
                source = patch.get("source").getAsString();
            }
            if (patch.has("customHome")) {
                if (patch.get("customHome").isJsonNull()) {
                    customHome = null;
                } else {
                    customHome = patch.get("customHome").getAsString();
                }
            }
        }
        if (source == null || source.isBlank()) {
            source = "bundled";
        }
        source = source.trim().toLowerCase();
        DesktopPreferencesStore.setJre(source, customHome);
        JsonObject runtimePatch = new JsonObject();
        JsonObject jre = new JsonObject();
        jre.addProperty("source", source);
        if (customHome == null || customHome.isBlank()) {
            jre.add("customHome", null);
        } else {
            jre.addProperty("customHome", customHome.trim());
        }
        runtimePatch.add("jre", jre);
        RuntimeJsonStore.write(configDir, runtimePatch);
        return effectiveJrePrefs(configDir);
    }

    private void pickDirectoryAsync(CefQueryCallback callback, boolean registerAsFilesRoot) {
        SwingUtilities.invokeLater(() -> {
            try {
                String os = System.getProperty("os.name", "").toLowerCase();
                String path;
                if (os.contains("mac")) {
                    path = pickDirectoryNative();
                    if (path == null) {
                        path = pickDirectorySwing();
                    }
                } else {
                    // Windows/Linux: directory-mode JFileChooser (async; never block CEF thread).
                    path = pickDirectorySwing();
                }
                if (registerAsFilesRoot && path != null && !path.isBlank()) {
                    pathSandbox.registerRoot(Path.of(path));
                }
                callback.success(gson.toJson(path));
            } catch (Exception e) {
                JsonObject err = new JsonObject();
                err.addProperty("__error", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
                callback.success(gson.toJson(err));
            } finally {
                refocusBrowser.run();
            }
        });
    }

    private void pickFileAsync(CefQueryCallback callback, String extensionHint) {
        SwingUtilities.invokeLater(() -> {
            try {
                String path = pickFileSwing(extensionHint);
                if (path != null && !path.isBlank()) {
                    pathSandbox.allowOneShot(Path.of(path));
                }
                callback.success(gson.toJson(path));
            } catch (Exception e) {
                JsonObject err = new JsonObject();
                err.addProperty("__error", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
                callback.success(gson.toJson(err));
            } finally {
                refocusBrowser.run();
            }
        });
    }

    private String pickFileSwing(String extensionHint) {
        JFileChooser chooser = new JFileChooser();
        chooser.setDialogTitle("Select file");
        if (extensionHint != null && !extensionHint.isBlank()) {
            chooser.setFileFilter(new javax.swing.filechooser.FileNameExtensionFilter(
                    extensionHint.toUpperCase() + " files", extensionHint.replace(".", "")));
        }
        Path start = Path.of(System.getProperty("user.home"), "Documents");
        if (Files.isDirectory(start)) {
            chooser.setCurrentDirectory(start.toFile());
        }
        int result = chooser.showOpenDialog(null);
        if (result != JFileChooser.APPROVE_OPTION || chooser.getSelectedFile() == null) {
            return null;
        }
        return chooser.getSelectedFile().toPath().toAbsolutePath().normalize().toString();
    }

    private void selectSaveFileAsync(CefQueryCallback callback, String suggestedName, String extension) {
        SwingUtilities.invokeLater(() -> {
            try {
                String path = selectSaveFileSwing(suggestedName, extension);
                if (path != null && !path.isBlank()) {
                    pathSandbox.allowOneShot(Path.of(path));
                }
                callback.success(gson.toJson(path));
            } catch (Exception e) {
                JsonObject err = new JsonObject();
                err.addProperty("__error", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
                callback.success(gson.toJson(err));
            } finally {
                refocusBrowser.run();
            }
        });
    }

    private String selectSaveFileSwing(String suggestedName, String extension) {
        String ext = extension == null ? "" : extension.trim().replace(".", "").toLowerCase();
        JFileChooser chooser = new JFileChooser();
        chooser.setDialogTitle("Export");
        if (!ext.isBlank()) {
            chooser.setFileFilter(new javax.swing.filechooser.FileNameExtensionFilter(
                    ext.toUpperCase() + " files", ext));
        }
        Path start = resolveExportStartDirectory();
        if (Files.isDirectory(start)) {
            chooser.setCurrentDirectory(start.toFile());
        }
        String fileName = suggestedName == null || suggestedName.isBlank()
                ? (ext.isBlank() ? "export" : "export." + ext)
                : suggestedName.trim();
        if (!ext.isBlank() && !fileName.toLowerCase().endsWith("." + ext)) {
            fileName = fileName + "." + ext;
        }
        chooser.setSelectedFile(start.resolve(fileName).toFile());
        int result = chooser.showSaveDialog(null);
        if (result != JFileChooser.APPROVE_OPTION || chooser.getSelectedFile() == null) {
            return null;
        }
        Path chosen = chooser.getSelectedFile().toPath().toAbsolutePath().normalize();
        String chosenName = chosen.getFileName() == null ? "" : chosen.getFileName().toString();
        if (!ext.isBlank() && !chosenName.toLowerCase().endsWith("." + ext)) {
            chosen = chosen.resolveSibling(chosenName + "." + ext);
        }
        return chosen.toString();
    }

    /** Prefer workspace exports/; fall back to Documents. */
    private Path resolveExportStartDirectory() {
        try {
            Path exports = backend.resolveRuntimeConfigDir().resolve("exports");
            Files.createDirectories(exports);
            return exports;
        } catch (Exception ignored) {
            Path documents = Path.of(System.getProperty("user.home"), "Documents");
            return Files.isDirectory(documents) ? documents : Path.of(System.getProperty("user.home"));
        }
    }

    /** Windows/macOS: java.awt.FileDialog is peer-native and does not freeze CEF as often. */
    private String pickDirectoryNative() {
        try {
            // macOS directory mode; ignored elsewhere
            System.setProperty("apple.awt.fileDialogForDirectories", "true");
            java.awt.FileDialog dialog = new java.awt.FileDialog(frame, "Select DataWise workspace", java.awt.FileDialog.LOAD);
            Path start = Path.of(System.getProperty("user.home"), "Documents");
            if (Files.isDirectory(start)) {
                dialog.setDirectory(start.toString());
            }
            dialog.setVisible(true);
            String dir = dialog.getDirectory();
            String file = dialog.getFile();
            if (dir == null) {
                return null;
            }
            Path chosen = file == null || file.isBlank() ? Path.of(dir) : Path.of(dir, file);
            // On Windows FileDialog selects a file; if user picks inside a folder, use parent if needed.
            if (Files.isDirectory(chosen)) {
                return chosen.toAbsolutePath().normalize().toString();
            }
            if (Files.isRegularFile(chosen) && chosen.getParent() != null) {
                return chosen.getParent().toAbsolutePath().normalize().toString();
            }
            if (Files.isDirectory(Path.of(dir))) {
                return Path.of(dir).toAbsolutePath().normalize().toString();
            }
            return null;
        } catch (Exception e) {
            return null;
        }
    }

    private String pickDirectorySwing() {
        JFileChooser chooser = new JFileChooser();
        chooser.setFileSelectionMode(JFileChooser.DIRECTORIES_ONLY);
        chooser.setDialogTitle("Select DataWise workspace");
        Path start = Path.of(System.getProperty("user.home"), "Documents");
        if (Files.isDirectory(start)) {
            chooser.setCurrentDirectory(start.toFile());
        }
        // Parent null avoids CEF modality deadlocks with undecorated frames.
        int result = chooser.showOpenDialog(null);
        if (result != JFileChooser.APPROVE_OPTION || chooser.getSelectedFile() == null) {
            return null;
        }
        return chooser.getSelectedFile().toPath().toAbsolutePath().normalize().toString();
    }

    private void applyConfigDir(String configDir) {
        JsonObject patch = new JsonObject();
        if (configDir == null || configDir.isBlank()) {
            patch.add("configDir", null);
        } else {
            Path resolved = backend.resolveConfiguredConfigPath(configDir);
            patch.addProperty("configDir", resolved.toString());
            DesktopPreferencesStore.touchRecent(resolved.toString());
        }
        DesktopPreferencesStore.write(patch);
    }

    private void restartHost() {
        quitting = true;
        // Do not relaunch on the EDT: CEF/AWT shutdown during System.exit can abort the spawn
        // so the user only sees the old window close.
        Thread t = new Thread(
                () -> ProcessRelauncher.relaunch(backend, singleInstance),
                "datawise-workspace-relaunch"
        );
        t.setDaemon(false);
        t.start();
    }

    private JsonObject flushDeepLink() {
        List<String> pending = singleInstance.drainPending();
        if (pending.isEmpty()) {
            return null;
        }
        return DeepLinkParser.parse(pending.get(0));
    }

    private JsonObject openRuntimeLog() {
        JsonObject out = new JsonObject();
        Path path = backend.runtimeLogPath();
        out.addProperty("path", path.toString());
        if (!Files.isRegularFile(path)) {
            out.addProperty("ok", false);
            out.addProperty("error", "missing");
            return out;
        }
        try {
            if (Desktop.isDesktopSupported()) {
                Desktop.getDesktop().open(path.toFile());
                out.addProperty("ok", true);
            } else {
                out.addProperty("ok", false);
                out.addProperty("error", "open_failed");
            }
        } catch (Exception e) {
            out.addProperty("ok", false);
            out.addProperty("error", "open_failed");
        }
        return out;
    }

    public void pushDeepLink(String url) {
        JsonObject payload = DeepLinkParser.parse(url);
        if (payload != null) {
            // Renderer expects {connectionId, database, sql}
            JsonObject slim = new JsonObject();
            if (payload.has("connectionId")) {
                slim.add("connectionId", payload.get("connectionId"));
            }
            if (payload.has("database")) {
                slim.add("database", payload.get("database"));
            }
            if (payload.has("sql")) {
                slim.add("sql", payload.get("sql"));
            }
            push("datawise:deep-link:open", slim);
        }
    }

    public void push(String eventName, Object detail) {
        CefBrowser browser = browserRef.get();
        if (browser == null) {
            return;
        }
        String json = detail instanceof JsonElement el ? gson.toJson(el) : gson.toJson(detail);
        String script = "window.dispatchEvent(new CustomEvent("
                + jsonString(eventName) + ",{detail:" + json + "}));";
        browser.executeJavaScript(script, browser.getURL(), 0);
    }

    /**
     * Ask the renderer to persist workspace.tabs while the backend is still up.
     * CEF dispose / System.exit does not reliably fire beforeunload.
     */
    public void requestSessionFlushAndWait(long timeoutMs) {
        CefBrowser browser = browserRef.get();
        if (browser == null) {
            return;
        }
        CountDownLatch latch = new CountDownLatch(1);
        sessionFlushLatch = latch;
        String script = "(async function(){"
                + "try{"
                + "if(typeof window.__datawiseFlushWorkspaceSession==='function'){"
                + "await window.__datawiseFlushWorkspaceSession();}"
                + "}catch(e){}"
                + "finally{"
                + "try{"
                + "var b=window.__datawiseDesktopBridge;"
                + "if(b&&typeof b._ackSessionFlush==='function'){b._ackSessionFlush();}"
                + "}catch(e2){}"
                + "}"
                + "})();";
        try {
            browser.executeJavaScript(script, browser.getURL(), 0);
            latch.await(Math.max(200, timeoutMs), TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception ignored) {
        } finally {
            if (sessionFlushLatch == latch) {
                sessionFlushLatch = null;
            }
        }
    }

    private static String jsonString(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    private static String argString(JsonArray args, int index) {
        if (args.size() <= index || args.get(index).isJsonNull()) {
            return null;
        }
        return args.get(index).getAsString();
    }

    private static int argInt(JsonArray args, int index, int fallback) {
        if (args.size() <= index || args.get(index).isJsonNull()) {
            return fallback;
        }
        try {
            return args.get(index).getAsInt();
        } catch (Exception e) {
            return fallback;
        }
    }

    private static boolean argBool(JsonArray args, int index, boolean fallback) {
        if (args.size() <= index || args.get(index).isJsonNull()) {
            return fallback;
        }
        try {
            return args.get(index).getAsBoolean();
        } catch (Exception e) {
            return fallback;
        }
    }

    private static double argDouble(JsonArray args, int index, double fallback) {
        if (args.size() <= index || args.get(index).isJsonNull()) {
            return fallback;
        }
        try {
            return args.get(index).getAsDouble();
        } catch (Exception e) {
            return fallback;
        }
    }

    private <T> T runOnEdt(EdtCallable<T> callable) throws Exception {
        if (SwingUtilities.isEventDispatchThread()) {
            return callable.call();
        }
        AtomicReference<T> result = new AtomicReference<>();
        AtomicReference<Exception> error = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);
        SwingUtilities.invokeLater(() -> {
            try {
                result.set(callable.call());
            } catch (Exception e) {
                error.set(e);
            } finally {
                latch.countDown();
            }
        });
        if (!latch.await(15, TimeUnit.SECONDS)) {
            throw new IllegalStateException("EDT call timed out");
        }
        if (error.get() != null) {
            throw error.get();
        }
        return result.get();
    }

    @FunctionalInterface
    private interface EdtCallable<T> {
        T call() throws Exception;
    }
}
