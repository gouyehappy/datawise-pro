package org.apache.datawise.desktop.bridge;

import org.apache.datawise.desktop.prefs.RendererUiStore;

/**
 * Injects {@code window.__datawiseDesktopBridge} before Vue bootstraps.
 * Terminal is intentionally omitted so the renderer uses {@code /ws/terminal}.
 */
public final class DesktopBridgeScript {
    private DesktopBridgeScript() {
    }

    public static String build(String platform, String apiBaseUrl, String appVersion, boolean packaged) {
        String platformJson = jsonString(platform);
        String apiJson = jsonString(apiBaseUrl);
        String versionJson = jsonString(appVersion);
        String uiBootstrap = RendererUiStore.localStorageBootstrapJs();
        return uiBootstrap + """
                (function () {
                  if (window.__datawiseDesktopBridge) return;
                  function invoke(channel, args) {
                    args = args || [];
                    return new Promise(function (resolve, reject) {
                      if (typeof window.cefQuery !== 'function') {
                        reject(new Error('cefQuery unavailable'));
                        return;
                      }
                      window.cefQuery({
                        request: JSON.stringify({ channel: channel, args: args }),
                        persistent: false,
                        onSuccess: function (response) {
                          try {
                            var parsed = response ? JSON.parse(response) : null;
                            if (parsed && typeof parsed === 'object' && Object.prototype.hasOwnProperty.call(parsed, '__error')) {
                              reject(new Error(parsed.__error || 'bridge error'));
                              return;
                            }
                            resolve(parsed);
                          } catch (e) {
                            resolve(response);
                          }
                        },
                        onFailure: function (code, msg) {
                          reject(new Error(msg || ('bridge failure ' + code)));
                        }
                      });
                    });
                  }
                  function listen(eventName) {
                    var handlers = [];
                    window.addEventListener(eventName, function (ev) {
                      handlers.forEach(function (h) {
                        try { h(ev.detail); } catch (e) {}
                      });
                    });
                    return function (callback) {
                      handlers.push(callback);
                      return function () {
                        handlers = handlers.filter(function (h) { return h !== callback; });
                      };
                    };
                  }
                  var onWindowState = listen('datawise:window:state-changed');
                  var onMaximize = listen('datawise:window:maximize-changed');
                  var onUpdater = listen('datawise:updater:status');
                  var onDeepLink = listen('datawise:deep-link:open');
                  var onBackend = listen('datawise:backend:startup-progress');
                  var onFileOpen = listen('datawise:file:open');
                  var onTheme = listen('datawise:theme:system-changed');
                  window.__datawiseDesktopBridge = {
                    platform: %s,
                    apiBaseUrl: %s,
                    appVersion: %s,
                    isPackaged: %s,
                    window: {
                      getState: function () { return invoke('window:getState'); },
                      setState: function (state) { return invoke('window:setState', [state]); },
                      onStateChange: onWindowState
                    },
                    chrome: {
                      minimize: function () { return invoke('window:minimize'); },
                      toggleMaximize: function () { return invoke('window:toggleMaximize'); },
                      close: function () { return invoke('window:close'); },
                      isMaximized: function () { return invoke('window:isMaximized'); },
                      onMaximizeChange: onMaximize,
                      startDrag: function (screenX, screenY) {
                        return invoke('window:startDrag', [screenX, screenY]);
                      },
                      dragTo: function (screenX, screenY) {
                        return invoke('window:dragTo', [screenX, screenY]);
                      },
                      endDrag: function () {
                        return invoke('window:endDrag');
                      }
                    },
                    _ackSessionFlush: function () { return invoke('app:sessionFlushed'); },
                    updater: {
                      checkForUpdates: function () { return invoke('updater:checkForUpdates'); },
                      downloadUpdate: function () { return invoke('updater:downloadUpdate'); },
                      quitAndInstall: function () { return invoke('updater:quitAndInstall'); },
                      setPreferences: function (prefs) { return invoke('updater:setPreferences', [prefs]); },
                      getStatus: function () { return invoke('updater:getStatus'); },
                      onStatus: onUpdater
                    },
                    config: {
                      getSettings: function () { return invoke('config:getSettings'); },
                      pickDirectory: function () { return invoke('config:pickDirectory'); },
                      applyAndRestart: function (configDir) { return invoke('config:applyAndRestart', [configDir]); },
                      switchWorkspace: function (resolvedPath) { return invoke('config:switchWorkspace', [resolvedPath]); },
                      removeRecentWorkspace: function (resolvedPath) { return invoke('config:removeRecentWorkspace', [resolvedPath]); },
                      createWorkspace: function (name) { return invoke('config:createWorkspace', [name]); },
                      resolvePath: function (configured) { return invoke('config:resolvePath', [configured]); },
                      clearRuntimeSetupPending: function () { return invoke('config:clearRuntimeSetupPending'); },
                      getJrePreferences: function () { return invoke('config:getJrePreferences'); },
                      setJrePreferences: function (prefs) { return invoke('config:setJrePreferences', [prefs]); }
                    },
                    deepLink: {
                      flushPending: function () { return invoke('deep-link:flushPending'); },
                      onOpen: onDeepLink
                    },
                    logs: {
                      openRuntime: function () { return invoke('logs:openRuntime'); }
                    },
                    backend: {
                      getStartupState: function () { return invoke('backend:getStartupState'); },
                      onStartupProgress: onBackend
                    },
                    uiStore: {
                      persist: function (patch) { return invoke('uiStore:persist', [patch]); },
                      clearSession: function () { return invoke('uiStore:clearSession'); }
                    },
                    fs: {
                      selectFile: function (ext) { return invoke('fs:selectFile', ext ? [ext] : []); },
                      selectSaveFile: function (suggestedName, ext) { return invoke('fs:selectSaveFile', [suggestedName || '', ext || '']); },
                      writeBinaryFile: function (path, base64) { return invoke('fs:writeBinaryFile', [path, base64 == null ? '' : String(base64)]); },
                      selectDirectory: function () { return invoke('fs:selectDirectory'); },
                      registerRoot: function (path) { return invoke('fs:registerRoot', [path]); },
                      revealInExplorer: function (path) { return invoke('fs:revealInExplorer', [path]); },
                      readTextFile: function (path) { return invoke('fs:readTextFile', [path]); },
                      readFileDataUrl: function (path) { return invoke('fs:readFileDataUrl', [path]); },
                      gitStatus: function (path) { return invoke('fs:gitStatus', [path]); },
                      gitDiff: function (path) { return invoke('fs:gitDiff', [path]); },
                      writeTextFile: function (path, content) { return invoke('fs:writeTextFile', [path, content == null ? '' : String(content)]); },
                      listDir: function (path, includeHidden) { return invoke('fs:listDir', [path, !!includeHidden]); },
                      stat: function (path) { return invoke('fs:stat', [path]); },
                      mkdir: function (path) { return invoke('fs:mkdir', [path]); },
                      rename: function (from, to) { return invoke('fs:rename', [from, to]); },
                      delete: function (path, recursive) { return invoke('fs:delete', [path, !!recursive]); },
                      openInTerminal: function (path) { return invoke('fs:openInTerminal', [path]); },
                      onOpen: onFileOpen
                    },
                    browser: {
                      setZoomLevel: function (level) { return invoke('browser:setZoomLevel', [level]); },
                      getZoomLevel: function () { return invoke('browser:getZoomLevel'); }
                    },
                    clipboard: {
                      readText: function () { return invoke('clipboard:readText'); },
                      writeText: function (text) { return invoke('clipboard:writeText', [text == null ? '' : String(text)]); }
                    },
                    shell: {
                      openExternal: function (url) { return invoke('shell:openExternal', [url]); },
                      setOpenHttpLinksIn: function (mode) { return invoke('shell:setOpenHttpLinksIn', [mode]); }
                    },
                    theme: {
                      getSystemAppearance: function () { return invoke('theme:getSystemAppearance'); },
                      onSystemChange: onTheme
                    },
                    devtools: {
                      toggle: function () { return invoke('devtools:toggle'); }
                    },
                    app: {
                      notifyMounted: function () { return invoke('app:notifyMounted'); },
                      notifyBootReady: function () { return invoke('app:notifyBootReady'); }
                    }
                  };
                })();
                try {
                  if (typeof window.__datawiseThemeBoot === 'function') {
                    window.__datawiseThemeBoot(true);
                  }
                } catch (e) {}
                """.formatted(platformJson, apiJson, versionJson, packaged ? "true" : "false");
    }

    private static String jsonString(String value) {
        if (value == null) {
            return "\"\"";
        }
        return "\"" + value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\r", "\\r")
                .replace("\n", "\\n")
                + "\"";
    }
}
