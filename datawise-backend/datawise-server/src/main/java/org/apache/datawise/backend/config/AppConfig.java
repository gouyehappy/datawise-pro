package org.apache.datawise.backend.config;

import org.apache.datawise.backend.configstore.SessionStore;
import org.apache.datawise.backend.configstore.UserStore;
import org.apache.datawise.backend.server.communityplugin.CommunityPluginUiTicketService;
import org.apache.datawise.backend.server.web.CommunityPluginUiCorsFilter;
import org.apache.datawise.backend.server.web.CorsOriginAllowlist;
import org.apache.datawise.backend.server.web.CorrelationIdFilter;
import org.apache.datawise.backend.server.web.PasswordChangeRequiredFilter;
import org.apache.datawise.backend.server.web.SessionAuthFilter;
import org.apache.datawise.backend.server.web.RequestLoggingFilter;
import org.apache.datawise.backend.service.ApiTokenService;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
public class AppConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public FilterRegistrationBean<CorrelationIdFilter> correlationIdFilterRegistration() {
        FilterRegistrationBean<CorrelationIdFilter> registration = new FilterRegistrationBean<>();
        registration.setFilter(new CorrelationIdFilter());
        registration.addUrlPatterns("/*");
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return registration;
    }

    @Bean
    public FilterRegistrationBean<CommunityPluginUiCorsFilter> communityPluginUiCorsFilterRegistration() {
        FilterRegistrationBean<CommunityPluginUiCorsFilter> registration = new FilterRegistrationBean<>();
        registration.setFilter(new CommunityPluginUiCorsFilter());
        registration.addUrlPatterns("/api/community-plugins/*");
        // Wrap the chain so we can collapse ACAO after Spring MVC / other filters write headers.
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE + 5);
        return registration;
    }

    @Bean
    public FilterRegistrationBean<SessionAuthFilter> sessionAuthFilterRegistration(
            SessionStore sessionStore,
            ApiTokenService apiTokenService,
            AuthSecurityProperties authSecurityProperties,
            CommunityPluginUiTicketService uiTicketService
    ) {
        FilterRegistrationBean<SessionAuthFilter> registration = new FilterRegistrationBean<>();
        registration.setFilter(new SessionAuthFilter(
                sessionStore,
                apiTokenService,
                authSecurityProperties,
                uiTicketService
        ));
        registration.addUrlPatterns("/*");
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE + 10);
        return registration;
    }

    @Bean
    public FilterRegistrationBean<PasswordChangeRequiredFilter> passwordChangeRequiredFilterRegistration(
            UserStore userStore,
            AuthSecurityProperties authSecurityProperties
    ) {
        FilterRegistrationBean<PasswordChangeRequiredFilter> registration = new FilterRegistrationBean<>();
        registration.setFilter(new PasswordChangeRequiredFilter(
                userStore,
                new CorsOriginAllowlist(authSecurityProperties.getAllowedOriginPatterns())
        ));
        registration.addUrlPatterns("/*");
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE + 15);
        return registration;
    }

    @Bean
    public FilterRegistrationBean<RequestLoggingFilter> requestLoggingFilterRegistration() {
        FilterRegistrationBean<RequestLoggingFilter> registration = new FilterRegistrationBean<>();
        registration.setFilter(new RequestLoggingFilter());
        registration.addUrlPatterns("/*");
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE + 20);
        return registration;
    }
}
