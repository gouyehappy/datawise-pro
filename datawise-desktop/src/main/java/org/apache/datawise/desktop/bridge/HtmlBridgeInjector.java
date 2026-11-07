package org.apache.datawise.desktop.bridge;

import org.apache.datawise.desktop.ui.SplashThemeInjector;

import java.nio.charset.StandardCharsets;

/**
 * Injects host theme seed + desktop bridge into Vue {@code index.html} before module scripts.
 */
public final class HtmlBridgeInjector {
    private HtmlBridgeInjector() {
    }

    public static byte[] injectIntoHtml(byte[] htmlBytes, String bridgeScript) {
        if (htmlBytes == null || htmlBytes.length == 0) {
            return htmlBytes;
        }
        String html = new String(htmlBytes, StandardCharsets.UTF_8);
        // Vite emits crossorigin= on modules; strip to avoid CORS edge cases in CEF.
        html = html.replace(" crossorigin", "");

        StringBuilder inject = new StringBuilder();
        inject.append(SplashThemeInjector.seedStyleBlock());
        if (bridgeScript != null && !bridgeScript.isBlank()) {
            String safeScript = bridgeScript.replace("</", "<\\/");
            inject.append("<script>").append(safeScript).append("</script>");
        }
        if (!inject.isEmpty()) {
            String payload = inject.toString();
            if (html.contains("<head>")) {
                html = html.replaceFirst("<head>", "<head>" + payload);
            } else if (html.contains("<HEAD>")) {
                html = html.replaceFirst("<HEAD>", "<HEAD>" + payload);
            } else {
                html = payload + html;
            }
        }
        return html.getBytes(StandardCharsets.UTF_8);
    }
}
