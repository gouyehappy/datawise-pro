package org.apache.datawise.desktop.cef;

import org.apache.datawise.desktop.prefs.DesktopOpenLinksPrefs;
import org.apache.datawise.desktop.util.DesktopFsUtil;
import org.cef.browser.CefBrowser;
import org.cef.browser.CefFrame;
import org.cef.handler.CefLifeSpanHandlerAdapter;

/**
 * When "open links in system browser" is on, cancel CEF popups ({@code target=_blank})
 * and open http(s) URLs with the OS default browser instead.
 */
public final class DesktopOpenLinksLifeSpanHandler extends CefLifeSpanHandlerAdapter {

    @Override
    public boolean onBeforePopup(CefBrowser browser, CefFrame frame, String targetUrl, String targetFrameName) {
        if (!DesktopOpenLinksPrefs.useSystemBrowser()) {
            return false;
        }
        if (targetUrl == null || targetUrl.isBlank()) {
            return true;
        }
        String trimmed = targetUrl.trim();
        String lower = trimmed.toLowerCase();
        if (!(lower.startsWith("http://") || lower.startsWith("https://"))) {
            // Block non-http popups while in system-browser mode (avoid nested CEF windows).
            return true;
        }
        try {
            DesktopFsUtil.openExternal(trimmed);
        } catch (Exception ignored) {
            // Prefer no CEF popup even if browse fails.
        }
        return true;
    }
}
