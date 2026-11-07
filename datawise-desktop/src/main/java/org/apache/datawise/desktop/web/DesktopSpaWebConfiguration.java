package org.apache.datawise.desktop.web;

import org.apache.datawise.desktop.DesktopPaths;
import org.apache.datawise.desktop.DesktopRuntimePorts;
import org.apache.datawise.desktop.bridge.DesktopBridgeScript;
import org.apache.datawise.desktop.bridge.HtmlBridgeInjector;
import org.apache.datawise.desktop.updater.DesktopUpdaterService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;
import org.springframework.web.servlet.resource.TransformedResource;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;

/**
 * Serves packaged Vue {@code frontend-dist} from the install directory on the API port (same origin),
 * injecting {@code window.__datawiseDesktopBridge} into HTML as a CEF load-handler fallback.
 */
@Configuration
@ConditionalOnClass(WebMvcConfigurer.class)
@ConditionalOnProperty(name = "datawise.gui", havingValue = "true", matchIfMissing = false)
public class DesktopSpaWebConfiguration implements WebMvcConfigurer {

    private final String bridgeScript = buildBridgeScript();

    private static String buildBridgeScript() {
        boolean packaged = Boolean.parseBoolean(System.getProperty("datawise.packaged", "false"))
                || Boolean.parseBoolean(System.getenv().getOrDefault("DATAWISE_PACKAGED", "false"));
        String platform = resolvePlatform();
        String apiBaseUrl = System.getenv("DATAWISE_API_BASE_URL");
        if (apiBaseUrl == null || apiBaseUrl.isBlank()) {
            int port = packaged ? DesktopRuntimePorts.desktopBackend() : DesktopRuntimePorts.devBackend();
            apiBaseUrl = "http://127.0.0.1:" + port;
        }
        return DesktopBridgeScript.build(
                platform, apiBaseUrl, DesktopUpdaterService.resolveCurrentVersion(), packaged);
    }

    private static String resolvePlatform() {
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        if (os.contains("win")) {
            return "win32";
        }
        if (os.contains("mac")) {
            return "darwin";
        }
        return "linux";
    }

    /**
     * Spring Boot's welcome-page mapping steals GET {@code /} and looks only under classpath
     * static locations — which misses {@code frontend-dist}. Forward to {@code /index.html}
     * so our resource handler (with bridge inject) serves the SPA entry.
     */
    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        Path dist = DesktopPaths.frontendDistRoot();
        if (Files.isRegularFile(dist.resolve("index.html"))) {
            registry.addViewController("/").setViewName("forward:/index.html");
        }
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        Path dist = DesktopPaths.frontendDistRoot();
        if (!Files.isRegularFile(dist.resolve("index.html"))) {
            System.err.println("[datawise-desktop] frontend-dist missing at " + dist
                    + " — CEF will not load the SPA from the API port");
            return;
        }
        String location = dist.toAbsolutePath().normalize().toUri().toString();
        if (!location.endsWith("/")) {
            location = location + "/";
        }
        final String loc = location;
        final String bridge = bridgeScript;
        registry.addResourceHandler("/**")
                .addResourceLocations(loc)
                .resourceChain(true)
                .addResolver(new PathResourceResolver() {
                    @Override
                    protected Resource getResource(String resourcePath, Resource location) throws IOException {
                        String path = resourcePath == null ? "" : resourcePath.trim();
                        // GET / resolves to "" or "." — that is the dist directory, not index.html.
                        if (path.isEmpty() || ".".equals(path) || "/".equals(path)) {
                            return spaIndex();
                        }
                        Resource requested = super.getResource(path, location);
                        if (isServableFile(requested)) {
                            return maybeInjectHtml(requested);
                        }
                        // Vue history mode fallback
                        if (path.startsWith("api/")
                                || path.startsWith("ws/")
                                || path.startsWith("actuator")) {
                            return null;
                        }
                        return spaIndex();
                    }

                    private Resource spaIndex() throws IOException {
                        Path index = dist.resolve("index.html");
                        if (!Files.isRegularFile(index)) {
                            return null;
                        }
                        return maybeInjectHtml(new FileSystemResource(index));
                    }

                    private static boolean isServableFile(Resource resource) throws IOException {
                        if (resource == null || !resource.exists() || !resource.isReadable()) {
                            return false;
                        }
                        try {
                            return resource.getFile().isFile();
                        } catch (IOException ignored) {
                            // Non-file URL resources: require a filename (skip bare directories).
                            String name = resource.getFilename();
                            return name != null && !name.isBlank() && !".".equals(name);
                        }
                    }

                    private Resource maybeInjectHtml(Resource resource) throws IOException {
                        String filename = resource.getFilename();
                        if (filename == null || !filename.toLowerCase(Locale.ROOT).endsWith(".html")) {
                            return resource;
                        }
                        byte[] raw = resource.getInputStream().readAllBytes();
                        byte[] injected = HtmlBridgeInjector.injectIntoHtml(raw, bridge);
                        return new TransformedResource(resource, injected);
                    }
                });
        System.out.println("[datawise-desktop] serving SPA from " + dist + " (bridge inject enabled)");
    }
}
