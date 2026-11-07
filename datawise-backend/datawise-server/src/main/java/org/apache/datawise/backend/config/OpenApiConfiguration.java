package org.apache.datawise.backend.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConditionalOnClass(name = "org.springdoc.core.configuration.SpringDocConfiguration")
public class OpenApiConfiguration {

    public static final String SESSION_SCHEME = "DwSession";
    public static final String API_TOKEN_SCHEME = "DwApiToken";

    @Bean
    public OpenAPI datawiseOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("DataWise API")
                        .description("REST contract for DataWise frontend, MCP, and headless CLI. "
                                + "Export: GET /v3/api-docs (JSON). UI: /swagger-ui.html")
                        .version("4.1.7"))
                .components(new Components()
                        .addSecuritySchemes(SESSION_SCHEME, new SecurityScheme()
                                .name("X-DW-Session-Id")
                                .type(SecurityScheme.Type.APIKEY)
                                .in(SecurityScheme.In.HEADER))
                        .addSecuritySchemes(API_TOKEN_SCHEME, new SecurityScheme()
                                .name("X-DW-Api-Token")
                                .type(SecurityScheme.Type.APIKEY)
                                .in(SecurityScheme.In.HEADER)))
                .addSecurityItem(new SecurityRequirement()
                        .addList(SESSION_SCHEME)
                        .addList(API_TOKEN_SCHEME));
    }
}
