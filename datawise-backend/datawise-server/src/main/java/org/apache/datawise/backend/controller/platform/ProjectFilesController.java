package org.apache.datawise.backend.controller.platform;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.ProjectDeleteRequest;
import org.apache.datawise.backend.domain.ProjectFileContentDto;
import org.apache.datawise.backend.domain.ProjectFileEntryDto;
import org.apache.datawise.backend.domain.ProjectFileShareDto;
import org.apache.datawise.backend.domain.ProjectFileShareRequest;
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

    /**
     * 登录 / 切换项目后初始化目录骨架：为当前账号建好私有 docs|scripts 两个空目录，
     * 不复制任何文件。团队共享改为按需共享私有目录，不再预建共享大区。
     */
    @PostMapping("/ensure-roots")
    public ApiResponse<Void> ensureRoots(@PathVariable String projectId) {
        projectFilesService.ensureRootsForCurrentUser(projectId);
        return ApiResponse.ok(null);
    }

    /** 当前项目里所有生效的共享目录（用于展示来源 / 判断共享状态）。 */
    @GetMapping("/shares")
    public ApiResponse<List<ProjectFileShareDto>> listShares(@PathVariable String projectId) {
        return ApiResponse.ok(projectFilesService.listShares(projectId));
    }

    /** 把自己私有区里的某个目录共享给项目内其它注册账号。 */
    @PostMapping("/shares")
    @RequiresFeature(UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_EDIT)
    public ApiResponse<ProjectFileShareDto> share(
            @PathVariable String projectId,
            @RequestBody ProjectFileShareRequest request
    ) {
        return ApiResponse.ok(projectFilesService.share(projectId, request));
    }

    /** 取消共享（只能取消自己共享出去的目录）。 */
    @PostMapping("/shares/unshare")
    @RequiresFeature(UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_EDIT)
    public ApiResponse<Void> unshare(
            @PathVariable String projectId,
            @RequestBody ProjectFileShareRequest request
    ) {
        projectFilesService.unshare(projectId, request);
        return ApiResponse.ok(null);
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
