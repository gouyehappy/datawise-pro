package org.apache.datawise.desktop.cef;

import org.cef.CefClient;
import org.cef.browser.CefBrowser;
import org.cef.browser.CefFrame;
import org.cef.callback.CefContextMenuParams;
import org.cef.callback.CefMenuModel;
import org.cef.handler.CefContextMenuHandlerAdapter;

/**
 * Disables Chromium's built-in context menu (Back / Forward / Print / View page source).
 * <p>
 * The Vue UI owns right-click menus via {@code contextmenu} + {@code preventDefault};
 * without clearing the CEF menu model, JCEF still paints the native Chromium items on top.
 */
public final class DesktopNativeContextMenu {
    private DesktopNativeContextMenu() {
    }

    public static void suppress(CefClient client) {
        if (client == null) {
            return;
        }
        client.addContextMenuHandler(new CefContextMenuHandlerAdapter() {
            @Override
            public void onBeforeContextMenu(
                    CefBrowser browser,
                    CefFrame frame,
                    CefContextMenuParams params,
                    CefMenuModel model
            ) {
                if (model != null) {
                    model.clear();
                }
            }
        });
    }
}
