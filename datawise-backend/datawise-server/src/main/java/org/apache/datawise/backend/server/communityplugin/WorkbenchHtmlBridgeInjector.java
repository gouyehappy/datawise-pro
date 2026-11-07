package org.apache.datawise.backend.server.communityplugin;

import org.springframework.core.io.ClassPathResource;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Injects the workbench Host API bootstrap into plugin {@code index.html}
 * so {@code window.datawisePlugin} exists before the plugin Vue module boots
 * (avoids CEF/iframe races where parent {@code contentDocument} injection is too late or blocked).
 *
 * <p>Also injects a first-paint guard so the iframe does not flash the browser default white
 * background before CSS modules / host theme messages apply. Host passes {@code dwAppearance}
 * on the iframe URL; dark is the safe default for DataWise.
 */
public final class WorkbenchHtmlBridgeInjector {
    private static final AtomicReference<String> BOOTSTRAP = new AtomicReference<>();

    /**
     * Synchronous first paint: dark canvas by default; flips to light when
     * {@code ?dwAppearance=light} is present (set by CommunityWorkbenchHost).
     */
    static final String PAINT_GUARD = ""
            + "<style id=\"datawise-plugin-paint-guard\">"
            + "html,body{margin:0;width:100%;height:100%;background:#131416;color-scheme:dark}"
            + "</style>"
            + "<script id=\"datawise-plugin-paint-guard-boot\">"
            + "(function(){try{"
            + "var q=new URLSearchParams(location.search||'');"
            + "if(q.get('dwAppearance')!=='light')return;"
            + "var s=document.getElementById('datawise-plugin-paint-guard');"
            + "if(s)s.textContent='html,body{margin:0;width:100%;height:100%;background:#fff;color-scheme:light}';"
            + "var r=document.documentElement;"
            + "r.style.colorScheme='light';"
            + "r.setAttribute('data-theme','light');"
            + "r.setAttribute('data-dw-theme','light');"
            + "}catch(e){}})();"
            + "</script>";

    private WorkbenchHtmlBridgeInjector() {
    }

    public static byte[] injectIntoHtml(byte[] htmlBytes) {
        if (htmlBytes == null || htmlBytes.length == 0) {
            return htmlBytes;
        }
        String html = new String(htmlBytes, StandardCharsets.UTF_8);
        // Vite emits crossorigin on module/CSS tags; opaque-origin iframes then require
        // CORS. Stripping matches the desktop HtmlBridgeInjector and avoids credentialed
        // CORS mode on those subresources (modules still use CORS, but anonymously).
        html = html.replace(" crossorigin", "");
        if (html.contains("datawise-plugin-bridge-bootstrap") || html.contains("__dwHostBridge")) {
            return html.getBytes(StandardCharsets.UTF_8);
        }
        String bootstrap = loadBootstrap();
        if (bootstrap == null || bootstrap.isBlank()) {
            return html.getBytes(StandardCharsets.UTF_8);
        }
        String safe = bootstrap.replace("</", "<\\/");
        String payload = PAINT_GUARD
                + "<script id=\"datawise-plugin-bridge-bootstrap\">" + safe + "</script>";
        if (html.contains("<head>")) {
            html = html.replaceFirst("<head>", "<head>" + payload);
        } else if (html.contains("<HEAD>")) {
            html = html.replaceFirst("<HEAD>", "<HEAD>" + payload);
        } else {
            html = payload + html;
        }
        return html.getBytes(StandardCharsets.UTF_8);
    }

    private static String loadBootstrap() {
        // Always re-read from classpath so spring-boot:run / hot resource copies pick up
        // bootstrap fixes without requiring a full JVM restart (cache caused stale inject).
        try {
            ClassPathResource resource = new ClassPathResource("community-plugin/workbench-bridge-bootstrap.js");
            String script = new String(resource.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            BOOTSTRAP.set(script);
            return script;
        } catch (IOException e) {
            String cached = BOOTSTRAP.get();
            return cached != null ? cached : "";
        }
    }
}
