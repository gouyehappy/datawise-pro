package org.apache.datawise.desktop.integration;

import org.apache.datawise.desktop.bridge.DesktopBridgeRouter;
import org.apache.datawise.desktop.deeplink.SingleInstanceGuard;
import org.apache.datawise.desktop.ui.DesktopMainFrame;

import java.awt.Desktop;
import java.awt.desktop.AppReopenedListener;
import java.io.File;
import java.net.URI;

/**
 * macOS / desktop environment hooks: graceful quit, open URI/file, Dock reopen.
 */
public final class DesktopIntegration {
    private DesktopIntegration() {
    }

    public static void install(DesktopMainFrame frame, DesktopBridgeRouter bridge, SingleInstanceGuard guard) {
        if (!Desktop.isDesktopSupported()) {
            return;
        }
        Desktop desktop = Desktop.getDesktop();

        if (desktop.isSupported(Desktop.Action.APP_QUIT_HANDLER)) {
            desktop.setQuitHandler((e, response) -> {
                response.cancelQuit();
                frame.requestGracefulQuit();
            });
        }

        try {
            desktop.addAppEventListener((AppReopenedListener) e -> frame.showFromDock());
        } catch (Exception ignored) {
        }

        if (desktop.isSupported(Desktop.Action.APP_OPEN_URI)) {
            desktop.setOpenURIHandler(e -> handleUri(frame, bridge, e.getURI()));
        }

        if (desktop.isSupported(Desktop.Action.APP_OPEN_FILE)) {
            desktop.setOpenFileHandler(e -> {
                if (e.getFiles() == null) {
                    return;
                }
                for (File file : e.getFiles()) {
                    if (file != null) {
                        bridge.pushOpenFile(file.getAbsolutePath());
                    }
                }
                frame.showFromDock();
            });
        }
    }

    private static void handleUri(DesktopMainFrame frame, DesktopBridgeRouter bridge, URI uri) {
        if (uri == null) {
            return;
        }
        String raw = uri.toString();
        if (raw.startsWith("datawise:")) {
            bridge.pushDeepLink(raw);
        } else {
            bridge.pushExternalUri(raw);
        }
        frame.showFromDock();
    }
}
