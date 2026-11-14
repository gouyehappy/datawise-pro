package org.apache.datawise.backend.service.portability;

import org.apache.datawise.backend.configstore.UserAppConfigStore;
import org.apache.datawise.backend.security.SecretValueCodec;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Cloud sync settings + WebDAV transport over redacted-by-default {@code .dwprofile} packages.
 */
@Service
public class ConfigCloudSyncService {

    private static final Logger log = LoggerFactory.getLogger(ConfigCloudSyncService.class);
    public static final String APP_SECTION = "cloudSync";

    private final UserAppConfigStore userAppConfigStore;
    private final ProfilePortabilityService portabilityService;
    private final SecretValueCodec secretValueCodec;
    private final UserAccessPolicy userAccessPolicy;
    private final WebDavConfigSyncClient webDavClient;

    public ConfigCloudSyncService(
                                  UserAppConfigStore userAppConfigStore,
                                  ProfilePortabilityService portabilityService,
                                  SecretValueCodec secretValueCodec,
                                  UserAccessPolicy userAccessPolicy) {
        this.userAppConfigStore = userAppConfigStore;
        this.portabilityService = portabilityService;
        this.secretValueCodec = secretValueCodec;
        this.userAccessPolicy = userAccessPolicy;
        this.webDavClient = new WebDavConfigSyncClient();
    }

    public ConfigCloudSyncSettings getSettings() {
        userAccessPolicy.requireRegisteredUser();
        long userId = UserContext.requireUserId();
        ConfigCloudSyncSettings settings = readStored(userId);
        settings.setPassword("");
        return settings;
    }

    public ConfigCloudSyncSettings saveSettings(ConfigCloudSyncSettings incoming) throws Exception {
        userAccessPolicy.requireRegisteredUser();
        long userId = UserContext.requireUserId();
        ConfigCloudSyncSettings current = readStored(userId);
        ConfigCloudSyncSettings next = new ConfigCloudSyncSettings();
        next.setBaseUrl(incoming != null ? incoming.getBaseUrl() : "");
        next.setUsername(incoming != null ? incoming.getUsername() : "");
        next.setRemotePath(incoming != null ? incoming.getRemotePath() : current.getRemotePath());
        String newPassword = incoming != null ? incoming.getPassword() : null;
        if (newPassword != null && !newPassword.isBlank()) {
            next.setPassword(secretValueCodec.encryptForStorage(newPassword));
            next.setHasPassword(true);
        } else {
            next.setPassword(current.getPassword());
            next.setHasPassword(current.isHasPassword()
                    || (current.getPassword() != null && !current.getPassword().isBlank()));
        }
        writeStored(userId, next);
        ConfigCloudSyncSettings publicView = new ConfigCloudSyncSettings();
        publicView.setBaseUrl(next.getBaseUrl());
        publicView.setUsername(next.getUsername());
        publicView.setRemotePath(next.getRemotePath());
        publicView.setHasPassword(next.isHasPassword());
        publicView.setPassword("");
        return publicView;
    }

    public void testWebDav(ConfigCloudSyncSettings override) throws Exception {
        userAccessPolicy.requireRegisteredUser();
        ResolvedWebDav creds = resolveCreds(override);
        webDavClient.test(creds.baseUrl(), creds.username(), creds.password(), creds.remotePath());
    }

    public void upload(ProfileExportRequest exportRequest, ConfigCloudSyncSettings override) throws Exception {
        userAccessPolicy.requireRegisteredUser();
        ProfileExportRequest request = exportRequest != null ? exportRequest : new ProfileExportRequest();
        if (request.getIncludeSecrets() == null) {
            request.setIncludeSecrets(false);
        }
        if (request.resolvesIncludeSecrets()) {
            // Explicit sealed sync still allowed, but never the silent default.
            if (request.getPassphrase() == null || request.getPassphrase().isBlank()) {
                throw new IllegalArgumentException("PASSPHRASE_REQUIRED");
            }
        }
        byte[] pkg = portabilityService.exportProfile(request);
        ResolvedWebDav creds = resolveCreds(override);
        webDavClient.upload(creds.baseUrl(), creds.username(), creds.password(), creds.remotePath(), pkg);
        log.info("cloud-sync.uploaded userId={} secretMode={}",
                UserContext.requireUserId(),
                request.resolvesIncludeSecrets() ? ProfileManifest.SECRET_MODE_SEALED : ProfileManifest.SECRET_MODE_OMITTED);
    }

    public byte[] download(ConfigCloudSyncSettings override) throws Exception {
        userAccessPolicy.requireRegisteredUser();
        ResolvedWebDav creds = resolveCreds(override);
        return webDavClient.download(creds.baseUrl(), creds.username(), creds.password(), creds.remotePath());
    }

    private ResolvedWebDav resolveCreds(ConfigCloudSyncSettings override) {
        ConfigCloudSyncSettings stored = readStored(UserContext.requireUserId());
        String baseUrl = firstNonBlank(override != null ? override.getBaseUrl() : null, stored.getBaseUrl());
        String username = firstNonBlank(override != null ? override.getUsername() : null, stored.getUsername());
        String remotePath = firstNonBlank(override != null ? override.getRemotePath() : null, stored.getRemotePath());
        String password;
        if (override != null && override.getPassword() != null && !override.getPassword().isBlank()) {
            password = override.getPassword();
        } else {
            password = decryptPassword(stored.getPassword());
        }
        if (baseUrl == null || baseUrl.isBlank()) {
            throw new IllegalArgumentException("WEBDAV_URL_REQUIRED");
        }
        return new ResolvedWebDav(baseUrl, username != null ? username : "", password != null ? password : "",
                remotePath != null ? remotePath : "datawise/profile-sync.dwprofile");
    }

    private ConfigCloudSyncSettings readStored(long userId) {
        Map<String, Object> app = userAppConfigStore.readAppConfig(userId).orElseGet(LinkedHashMap::new);
        Object raw = app.get(APP_SECTION);
        ConfigCloudSyncSettings settings = new ConfigCloudSyncSettings();
        if (!(raw instanceof Map<?, ?> map)) {
            return settings;
        }
        Object webdav = map.get("webdav");
        if (!(webdav instanceof Map<?, ?> wd)) {
            return settings;
        }
        settings.setBaseUrl(asString(wd.get("baseUrl")));
        settings.setUsername(asString(wd.get("username")));
        settings.setPassword(asString(wd.get("password")));
        settings.setRemotePath(asString(wd.get("remotePath")));
        settings.setHasPassword(settings.getPassword() != null && !settings.getPassword().isBlank());
        return settings;
    }

    private void writeStored(long userId, ConfigCloudSyncSettings settings) throws Exception {
        Map<String, Object> app = userAppConfigStore.readAppConfig(userId).orElseGet(LinkedHashMap::new);
        Map<String, Object> section = new LinkedHashMap<>();
        Map<String, Object> webdav = new LinkedHashMap<>();
        webdav.put("baseUrl", settings.getBaseUrl());
        webdav.put("username", settings.getUsername());
        webdav.put("password", settings.getPassword());
        webdav.put("remotePath", settings.getRemotePath());
        section.put("webdav", webdav);
        app.put(APP_SECTION, section);
        userAppConfigStore.writeAppConfig(userId, app);
    }

    private String decryptPassword(String stored) {
        if (stored == null || stored.isBlank()) {
            return "";
        }
        if (secretValueCodec.isEncrypted(stored)) {
            return secretValueCodec.decryptForUse(stored);
        }
        return stored;
    }

    private static String asString(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private static String firstNonBlank(String primary, String fallback) {
        if (primary != null && !primary.isBlank()) {
            return primary;
        }
        return fallback;
    }

    private record ResolvedWebDav(String baseUrl, String username, String password, String remotePath) {
    }
}
