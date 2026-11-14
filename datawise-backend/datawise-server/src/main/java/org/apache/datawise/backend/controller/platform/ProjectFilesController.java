package org.apache.datawise.backend.controller.platform;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.ProjectDeleteRequest;
import org.apache.datawise.backend.domain.ProjectFileContentDto;
import org.apache.datawise.backend.domain.ProjectFileEntryDto;
import org.apache.datawise.backend.domain.ProjectMkdirRequest;
import org.apache.datawise.backend.domain.ProjectRenameRequest;
import org.apache.datawise.backend.service.project.ProjectFilesService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

import org.apache.datawise.backend.domain.UserFeaturePermission;
import org.apache.datawise.backend.security.RequiresFeature;

@RestController
@RequestMapping("/api/projects/{projectId}/files")
@RequiresFeature(UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_OPEN)
public class ProjectFilesController {

    private final ProjectFilesService projectFilesService;

    public ProjectFilesController(ProjectFilesService projectFilesService) {
        this.projectFilesService = projectFilesService;
    }

    @GetMapping
    public ApiResponse<List<ProjectFileEntryDto>> list(
            @PathVariable String projectId,
            @RequestParam String root,
            @RequestParam(required = false, defaultValue = "") String path
    ) {
        return ApiResponse.ok(projectFilesService.list(projectId, root, path));
    }

    @GetMapping("/content")
    public ApiResponse<ProjectFileContentDto> read(
            @PathVariable String projectId,
            @RequestParam String root,
            @RequestParam String path
    ) {
        return ApiResponse.ok(projectFilesService.read(projectId, root, path));
    }

    @PutMapping("/content")
    @RequiresFeature(UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_EDIT)
    public ApiResponse<ProjectFileContentDto> write(
            @PathVariable String projectId,
            @RequestBody ProjectFileContentDto request
    ) {
        return ApiResponse.ok(projectFilesService.write(projectId, request));
    }

    @PostMapping("/mkdir")
    @RequiresFeature(UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_EDIT)
    public ApiResponse<ProjectFileEntryDto> mkdir(
            @PathVariable String projectId,
            @RequestBody ProjectMkdirRequest request
    ) {
        return ApiResponse.ok(projectFilesService.mkdir(projectId, request));
    }

    @PostMapping("/rename")
    @RequiresFeature(UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_EDIT)
    public ApiResponse<ProjectFileEntryDto> rename(
            @PathVariable String projectId,
            @RequestBody ProjectRenameRequest request
    ) {
        return ApiResponse.ok(projectFilesService.rename(projectId, request));
    }

    @PostMapping("/delete")
    @RequiresFeature(UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_EDIT)
    public ApiResponse<Void> delete(
            @PathVariable String projectId,
            @RequestBody ProjectDeleteRequest request
    ) {
        projectFilesService.delete(projectId, request);
        return ApiResponse.ok(null);
    }
}
