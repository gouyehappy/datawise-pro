package org.apache.datawise.backend.controller.appconfig;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.configstore.AppConfigStore;
import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.configstore.UserAppConfigStore;
import org.apache.datawise.backend.domain.ConnectionsCatalogDto;
import org.apache.datawise.backend.database.connection.ConnectionsCatalogService;
import org.apache.datawise.backend.security.AppConfigSecrets;
import org.apache.datawise.backend.service.UserResource;
import org.apache.datawise.backend.service.UserResourcePolicy;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/config")
public class AppConfigController {

    private final AppConfigStore appConfigStore;
    private final UserAppConfigStore userAppConfigStore;
    private final ConnectionStore connectionStore;
    private final ConnectionsCatalogService connectionsCatalogService;
    private final UserResourcePolicy resourcePolicy;

    public AppConfigController(
            AppConfigStore appConfigStore,
            UserAppConfigStore userAppConfigStore,
            ConnectionStore connectionStore,
            ConnectionsCatalogService connectionsCatalogService,
            UserResourcePolicy resourcePolicy
    ) {
        this.appConfigStore = appConfigStore;
        this.userAppConfigStore = userAppConfigStore;
        this.connectionStore = connectionStore;
        this.connectionsCatalogService = connectionsCatalogService;
        this.resourcePolicy = resourcePolicy;
    }

    @GetMapping("/app")
    public ApiResponse<Map<String, Object>> getAppConfig() {
        if (!resourcePolicy.canRead(UserResource.APP_CONFIG)) {
            return ApiResponse.ok(null);
        }
        return userAppConfigStore.readAppConfigSummary(resourcePolicy.readUserIdFor(UserResource.APP_CONFIG))
                .map(AppConfigSecrets::maskForClient)
                .map(ApiResponse::ok)
                .orElseGet(() -> ApiResponse.ok(null));
    }

    @PutMapping("/app")
    public ApiResponse<Void> putAppConfig(@RequestBody Map<String, Object> body) throws Exception {
        userAppConfigStore.writeAppConfig(resourcePolicy.requireRegisteredUserIdFor(UserResource.APP_CONFIG), body);
        return ApiResponse.ok(null);
    }

    @GetMapping(value = "/app.xml", produces = MediaType.APPLICATION_XML_VALUE)
    public String getAppConfigXml() throws Exception {
        if (!resourcePolicy.canRead(UserResource.APP_CONFIG)) {
            return "";
        }
        String xml = userAppConfigStore.readAppConfigXml(resourcePolicy.readUserIdFor(UserResource.APP_CONFIG));
        return xml != null ? xml : "";
    }

    @PutMapping(value = "/app.xml", consumes = MediaType.APPLICATION_XML_VALUE)
    public ApiResponse<Void> putAppConfigXml(@RequestBody String xml) throws Exception {
        resourcePolicy.requireWrite(UserResource.APP_CONFIG);
        userAppConfigStore.writeAppConfigXml(resourcePolicy.readUserIdFor(UserResource.APP_CONFIG), xml);
        return ApiResponse.ok(null);
    }

    @GetMapping("/workspace-session")
    public ApiResponse<Map<String, Object>> getWorkspaceSession() {
        if (!resourcePolicy.canRead(UserResource.APP_CONFIG)) {
            return ApiResponse.ok(null);
        }
        return userAppConfigStore.readWorkspaceSession(resourcePolicy.readUserIdFor(UserResource.APP_CONFIG))
                .map(ApiResponse::ok)
                .orElseGet(() -> ApiResponse.ok(null));
    }

    @PutMapping("/workspace-session")
    public ApiResponse<Void> putWorkspaceSession(@RequestBody Map<String, Object> body) throws Exception {
        userAppConfigStore.writeWorkspaceSession(
                resourcePolicy.requireRegisteredUserIdFor(UserResource.APP_CONFIG),
                body);
        return ApiResponse.ok(null);
    }

    @GetMapping("/ai-preferences")
    public ApiResponse<Map<String, Object>> getAiPreferences() {
        if (!resourcePolicy.canRead(UserResource.APP_CONFIG)) {
            return ApiResponse.ok(null);
        }
        return userAppConfigStore.readAiPreferences(resourcePolicy.readUserIdFor(UserResource.APP_CONFIG))
                .map(AppConfigSecrets::maskAiPreferencesForClient)
                .map(ApiResponse::ok)
                .orElseGet(() -> ApiResponse.ok(null));
    }

    @PutMapping("/ai-preferences")
    public ApiResponse<Void> putAiPreferences(@RequestBody Map<String, Object> body) throws Exception {
        userAppConfigStore.writeAiPreferences(
                resourcePolicy.requireRegisteredUserIdFor(UserResource.APP_CONFIG),
                body);
        return ApiResponse.ok(null);
    }

    @GetMapping("/explorer-ui")
    public ApiResponse<Map<String, Object>> getExplorerUi() {
        if (!resourcePolicy.canRead(UserResource.APP_CONFIG)) {
            return ApiResponse.ok(null);
        }
        return userAppConfigStore.readExplorerUi(resourcePolicy.readUserIdFor(UserResource.APP_CONFIG))
                .map(ApiResponse::ok)
                .orElseGet(() -> ApiResponse.ok(null));
    }

    @PutMapping("/explorer-ui")
    public ApiResponse<Void> putExplorerUi(@RequestBody Map<String, Object> body) throws Exception {
        userAppConfigStore.writeExplorerUi(
                resourcePolicy.requireRegisteredUserIdFor(UserResource.APP_CONFIG),
                body);
        return ApiResponse.ok(null);
    }

    @GetMapping("/window")
    public ApiResponse<Map<String, Object>> getWindow() {
        if (!resourcePolicy.canRead(UserResource.APP_CONFIG)) {
            return ApiResponse.ok(null);
        }
        return userAppConfigStore.readWindow(resourcePolicy.readUserIdFor(UserResource.APP_CONFIG))
                .map(ApiResponse::ok)
                .orElseGet(() -> ApiResponse.ok(null));
    }

    @PutMapping("/window")
    public ApiResponse<Void> putWindow(@RequestBody Map<String, Object> body) throws Exception {
        userAppConfigStore.writeWindow(
                resourcePolicy.requireRegisteredUserIdFor(UserResource.APP_CONFIG),
                body);
        return ApiResponse.ok(null);
    }

    @GetMapping("/local-files")
    public ApiResponse<Map<String, Object>> getLocalFiles() {
        if (!resourcePolicy.canRead(UserResource.APP_CONFIG)) {
            return ApiResponse.ok(null);
        }
        return userAppConfigStore.readLocalFiles(resourcePolicy.readUserIdFor(UserResource.APP_CONFIG))
                .map(ApiResponse::ok)
                .orElseGet(() -> ApiResponse.ok(null));
    }

    @PutMapping("/local-files")
    public ApiResponse<Void> putLocalFiles(@RequestBody Map<String, Object> body) throws Exception {
        userAppConfigStore.writeLocalFiles(
                resourcePolicy.requireRegisteredUserIdFor(UserResource.APP_CONFIG),
                body);
        return ApiResponse.ok(null);
    }

    @GetMapping("/sql-snippets/{layer}")
    public ApiResponse<Map<String, Object>> getSqlSnippets(@PathVariable String layer) {
        if (!"shared".equals(layer) && !"personal".equals(layer)) {
            throw new IllegalArgumentException("layer must be shared or personal");
        }
        if ("personal".equals(layer)) {
            if (!resourcePolicy.canRead(UserResource.SQL_SNIPPETS_PERSONAL)) {
                return ApiResponse.ok(null);
            }
            return userAppConfigStore.readPersonalSqlSnippets(
                    resourcePolicy.readUserIdFor(UserResource.SQL_SNIPPETS_PERSONAL)
            )
                    .map(ApiResponse::ok)
                    .orElseGet(() -> ApiResponse.ok(null));
        }
        return appConfigStore.readSqlSnippets(layer)
                .map(ApiResponse::ok)
                .orElseGet(() -> ApiResponse.ok(null));
    }

    @PutMapping("/sql-snippets/{layer}")
    public ApiResponse<Void> putSqlSnippets(
            @PathVariable String layer,
            @RequestBody Map<String, Object> body
    ) throws Exception {
        if (!"shared".equals(layer) && !"personal".equals(layer)) {
            throw new IllegalArgumentException("layer must be shared or personal");
        }
        if ("personal".equals(layer)) {
            resourcePolicy.requireWrite(UserResource.SQL_SNIPPETS_PERSONAL);
            userAppConfigStore.writePersonalSqlSnippets(
                    resourcePolicy.readUserIdFor(UserResource.SQL_SNIPPETS_PERSONAL),
                    body
            );
        } else {
            resourcePolicy.requireWrite(UserResource.SQL_SNIPPETS_SHARED);
            appConfigStore.writeSqlSnippets(layer, body);
        }
        return ApiResponse.ok(null);
    }

    @GetMapping("/updater")
    public ApiResponse<Map<String, Object>> getUpdaterPreferences() {
        return ApiResponse.ok(appConfigStore.readUpdaterPreferences());
    }

    @PutMapping("/updater")
    public ApiResponse<Void> putUpdaterPreferences(@RequestBody Map<String, Object> body) throws Exception {
        resourcePolicy.requireWrite(UserResource.UPDATER_PREFERENCES);
        appConfigStore.writeUpdaterPreferences(body);
        return ApiResponse.ok(null);
    }

    @GetMapping(value = "/connections.xml", produces = MediaType.APPLICATION_XML_VALUE)
    public String getConnectionsXml() throws Exception {
        return connectionStore.readConnectionsXml();
    }

    @GetMapping("/connections")
    public ApiResponse<ConnectionsCatalogDto> getConnectionsCatalog() {
        return ApiResponse.ok(connectionsCatalogService.exportCatalog());
    }

    @PutMapping("/connections")
    public ApiResponse<Void> putConnectionsCatalog(@RequestBody ConnectionsCatalogDto body) {
        connectionsCatalogService.replaceCatalog(body);
        return ApiResponse.ok(null);
    }

    @PutMapping(value = "/connections.xml", consumes = MediaType.APPLICATION_XML_VALUE)
    public ApiResponse<Void> putConnectionsXml(@RequestBody String xml) throws Exception {
        resourcePolicy.requireWrite(UserResource.CONNECTIONS_XML_BULK);
        connectionStore.importConnectionsXml(xml);
        return ApiResponse.ok(null);
    }
}
