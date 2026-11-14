package org.apache.datawise.backend.controller.appconfig;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.UserFeaturePermission;
import org.apache.datawise.backend.security.RequiresFeature;
import org.apache.datawise.backend.service.portability.ConfigCloudSyncService;
import org.apache.datawise.backend.service.portability.ConfigCloudSyncSettings;
import org.apache.datawise.backend.service.portability.ProfileExportRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/config/cloud-sync")
@RequiresFeature(UserFeaturePermission.SETTINGS_PROFILE)
public class ConfigCloudSyncController {

    private final ConfigCloudSyncService cloudSyncService;

    public ConfigCloudSyncController(ConfigCloudSyncService cloudSyncService) {
        this.cloudSyncService = cloudSyncService;
    }

    @GetMapping("/settings")
    public ApiResponse<ConfigCloudSyncSettings> getSettings() {
        return ApiResponse.ok(cloudSyncService.getSettings());
    }

    @PutMapping("/settings")
    public ApiResponse<ConfigCloudSyncSettings> saveSettings(@RequestBody ConfigCloudSyncSettings settings)
            throws Exception {
        return ApiResponse.ok(cloudSyncService.saveSettings(settings));
    }

    @PostMapping("/webdav/test")
    public ApiResponse<Map<String, Object>> testWebDav(@RequestBody(required = false) ConfigCloudSyncSettings override)
            throws Exception {
        cloudSyncService.testWebDav(override);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        return ApiResponse.ok(body);
    }

    public static class WebDavUploadRequest {
        private ProfileExportRequest export = new ProfileExportRequest();
        private ConfigCloudSyncSettings webdav;

        public ProfileExportRequest getExport() {
            return export;
        }

        public void setExport(ProfileExportRequest export) {
            this.export = export;
        }

        public ConfigCloudSyncSettings getWebdav() {
            return webdav;
        }

        public void setWebdav(ConfigCloudSyncSettings webdav) {
            this.webdav = webdav;
        }
    }

    @PostMapping("/webdav/upload")
    public ApiResponse<Map<String, Object>> upload(@RequestBody(required = false) WebDavUploadRequest body)
            throws Exception {
        ProfileExportRequest export = body != null && body.getExport() != null
                ? body.getExport()
                : new ProfileExportRequest();
        if (export.getIncludeSecrets() == null) {
            export.setIncludeSecrets(false);
        }
        cloudSyncService.upload(export, body != null ? body.getWebdav() : null);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        return ApiResponse.ok(result);
    }

    @PostMapping("/webdav/download")
    public ResponseEntity<byte[]> download(@RequestBody(required = false) ConfigCloudSyncSettings override)
            throws Exception {
        byte[] bytes = cloudSyncService.download(override);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"datawise-sync.dwprofile\"")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(bytes);
    }
}
