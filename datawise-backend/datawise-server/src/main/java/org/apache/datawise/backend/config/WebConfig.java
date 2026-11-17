package org.apache.datawise.backend.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.apache.datawise.backend.server.web.CorsOriginAllowlist;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final AuthSecurityProperties authSecurityProperties;

    public WebConfig(AuthSecurityProperties authSecurityProperties) {
        this.authSecurityProperties = authSecurityProperties != null
                ? authSecurityProperties
                : new AuthSecurityProperties();
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        CorsOriginAllowlist allowlist = new CorsOriginAllowlist(authSecurityProperties.getAllowedOriginPatterns());
        // Opaque-origin workbench iframes (sandbox without allow-same-origin) fetch Vite
        // module/CSS assets with Origin: null. Allow that only on public UI package paths —
        // never on credentialed API surfaces.
        registry.addMapping("/api/community-plugins/*/ui/**")
                .allowedOrigins("null")
                .allowedMethods("GET", "HEAD", "OPTIONS")
                .allowCredentials(false)
                .maxAge(3600);
        if (allowlist.isEmpty()) {
            // SEC-09: empty patterns = same-origin only (cloud profile default).
            // Do not register credentialed CORS with wildcards for SaaS.
            return;
        }
        // Desktop/dev: loopback + app://local only (see AuthSecurityProperties). Credentials OK
        // because patterns are narrow — never combine allowCredentials with "*" origins.
        registry.addMapping("/**")
                .allowedOriginPatterns(allowlist.springOriginPatterns())
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowCredentials(true);
    }
}
