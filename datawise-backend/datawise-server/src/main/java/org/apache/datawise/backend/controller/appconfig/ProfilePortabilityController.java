package org.apache.datawise.backend.controller.appconfig;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.service.portability.ProfileExportRequest;
import org.apache.datawise.backend.service.portability.ProfileImportOptions;
import org.apache.datawise.backend.service.portability.ProfileImportResult;
import org.apache.datawise.backend.service.portability.ProfilePortabilityService;
import org.apache.datawise.backend.service.portability.ProfilePreflightResult;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import org.apache.datawise.backend.domain.UserFeaturePermission;
import org.apache.datawise.backend.security.RequiresFeature;

@RestController
@RequestMapping("/api/config/portability")
@RequiresFeature(UserFeaturePermission.SETTINGS_PROFILE)
public class ProfilePortabilityController {

    private final ProfilePortabilityService portabilityService;
    private final ObjectMapper objectMapper;

    public ProfilePortabilityController(
            ProfilePortabilityService portabilityService,
            ObjectMapper objectMapper
    ) {
        this.portabilityService = portabilityService;
        this.objectMapper = objectMapper;
    }

    @PostMapping("/export")
    public ResponseEntity<byte[]> export(@RequestBody ProfileExportRequest request) throws Exception {
        byte[] bytes = portabilityService.exportProfile(request);
        String fileName = portabilityService.exportFileName(request);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + fileName + "\"")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(bytes);
    }

    @PostMapping(value = "/import/preflight", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<ProfilePreflightResult> preflight(
            @RequestPart("file") MultipartFile file,
            @RequestParam(value = "passphrase", required = false) String passphrase
    ) throws Exception {
        byte[] bytes = file != null ? file.getBytes() : null;
        return ApiResponse.ok(portabilityService.preflight(bytes, passphrase));
    }

    @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<ProfileImportResult> importProfile(
            @RequestPart("file") MultipartFile file,
            @RequestParam(value = "passphrase", required = false) String passphrase,
            @RequestParam(value = "options", required = false) String optionsJson
    ) throws Exception {
        byte[] bytes = file != null ? file.getBytes() : null;
        ProfileImportOptions options = optionsJson != null && !optionsJson.isBlank()
                ? objectMapper.readValue(optionsJson, ProfileImportOptions.class)
                : new ProfileImportOptions();
        return ApiResponse.ok(portabilityService.importProfile(bytes, passphrase, options));
    }
}
