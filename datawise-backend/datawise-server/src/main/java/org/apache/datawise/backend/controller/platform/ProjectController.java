package org.apache.datawise.backend.controller.platform;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.ActiveProjectDto;
import org.apache.datawise.backend.domain.CreateProjectRequest;
import org.apache.datawise.backend.domain.MoveProjectConnectionsRequest;
import org.apache.datawise.backend.domain.ProjectDto;
import org.apache.datawise.backend.domain.SetActiveProjectRequest;
import org.apache.datawise.backend.domain.ShareProjectConnectionsRequest;
import org.apache.datawise.backend.domain.UpdateProjectRequest;
import org.apache.datawise.backend.service.project.ProjectPackageService;
import org.apache.datawise.backend.service.project.ProjectService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

import org.apache.datawise.backend.domain.UserFeaturePermission;
import org.apache.datawise.backend.security.RequiresFeature;

@RestController
@RequestMapping("/api/projects")
@RequiresFeature(UserFeaturePermission.TITLE_BAR_WORKSPACE)
public class ProjectController {

    private final ProjectService projectService;
    private final ProjectPackageService projectPackageService;

    public ProjectController(ProjectService projectService, ProjectPackageService projectPackageService) {
        this.projectService = projectService;
        this.projectPackageService = projectPackageService;
    }

    @GetMapping
    public ApiResponse<List<ProjectDto>> list(
            @RequestParam(name = "includeArchived", defaultValue = "false") boolean includeArchived
    ) {
        return ApiResponse.ok(projectService.listProjects(includeArchived));
    }

    @PostMapping
    public ApiResponse<ProjectDto> create(@RequestBody CreateProjectRequest request) {
        return ApiResponse.ok(projectService.createProject(request));
    }

    @GetMapping("/active")
    public ApiResponse<ActiveProjectDto> getActive() {
        return ApiResponse.ok(projectService.getActiveProject());
    }

    @PutMapping("/active")
    public ApiResponse<ActiveProjectDto> setActive(@RequestBody SetActiveProjectRequest request) {
        return ApiResponse.ok(projectService.setActiveProject(request));
    }

    @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @RequiresFeature(UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_DANGEROUS)
    public ApiResponse<ProjectDto> importPackage(
            @RequestParam("file") MultipartFile file,
            @RequestParam(name = "name", required = false) String name
    ) throws Exception {
        byte[] bytes = file != null ? file.getBytes() : null;
        return ApiResponse.ok(projectPackageService.importProject(bytes, name));
    }

    @GetMapping("/{projectId}")
    public ApiResponse<ProjectDto> get(@PathVariable String projectId) {
        return ApiResponse.ok(projectService.getProject(projectId));
    }

    @PutMapping("/{projectId}")
    public ApiResponse<ProjectDto> update(
            @PathVariable String projectId,
            @RequestBody UpdateProjectRequest request
    ) {
        return ApiResponse.ok(projectService.updateProject(projectId, request));
    }

    @DeleteMapping("/{projectId}")
    @RequiresFeature(UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_DANGEROUS)
    public ApiResponse<Void> delete(
            @PathVariable String projectId,
            @RequestParam(name = "mode", defaultValue = "empty-only") String mode,
            @RequestParam(name = "confirmPurgeConnections", defaultValue = "false") boolean confirmPurgeConnections
    ) {
        projectService.deleteProject(projectId, mode, confirmPurgeConnections);
        return ApiResponse.ok(null);
    }

    @PostMapping("/{projectId}/connections/move")
    public ApiResponse<Map<String, Integer>> moveConnections(
            @PathVariable String projectId,
            @RequestBody MoveProjectConnectionsRequest request
    ) {
        int moved = projectService.moveConnections(projectId, request);
        return ApiResponse.ok(Map.of("moved", moved));
    }

    @PostMapping("/{projectId}/connections/share")
    public ApiResponse<Map<String, Integer>> shareConnections(
            @PathVariable String projectId,
            @RequestBody ShareProjectConnectionsRequest request
    ) {
        int updated = projectService.shareConnections(projectId, request);
        return ApiResponse.ok(Map.of("updated", updated));
    }

    @GetMapping("/{projectId}/export")
    public ResponseEntity<byte[]> export(@PathVariable String projectId) {
        byte[] zip = projectPackageService.exportProject(projectId);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"project-" + projectId + ".zip\"")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(zip);
    }
}
