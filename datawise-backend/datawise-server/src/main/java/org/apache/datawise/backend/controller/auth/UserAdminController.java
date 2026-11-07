package org.apache.datawise.backend.controller.auth;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.SaveTenantRoleRequest;
import org.apache.datawise.backend.domain.TenantRoleDto;
import org.apache.datawise.backend.domain.UpdateUserPermissionsRequest;
import org.apache.datawise.backend.domain.UpdateUserRolesRequest;
import org.apache.datawise.backend.domain.UserPermissionSummaryDto;
import org.apache.datawise.backend.service.UserAdminService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/admin")
public class UserAdminController {

    private final UserAdminService userAdminService;

    public UserAdminController(UserAdminService userAdminService) {
        this.userAdminService = userAdminService;
    }

    @GetMapping("/users")
    public ApiResponse<List<UserPermissionSummaryDto>> listUsers() {
        return ApiResponse.ok(userAdminService.listUsers());
    }

    @GetMapping("/tenant-roles")
    public ApiResponse<List<TenantRoleDto>> listRoles() {
        return ApiResponse.ok(userAdminService.listRoles());
    }

    @PostMapping("/tenant-roles")
    public ApiResponse<TenantRoleDto> createRole(@RequestBody SaveTenantRoleRequest request) {
        return ApiResponse.ok(userAdminService.createRole(request));
    }

    @PutMapping("/tenant-roles/{roleId}")
    public ApiResponse<TenantRoleDto> updateRole(
            @PathVariable String roleId,
            @RequestBody SaveTenantRoleRequest request
    ) {
        return ApiResponse.ok(userAdminService.updateRole(roleId, request));
    }

    @DeleteMapping("/tenant-roles/{roleId}")
    public ApiResponse<Void> deleteRole(@PathVariable String roleId) {
        userAdminService.deleteRole(roleId);
        return ApiResponse.ok(null);
    }

    @PutMapping("/users/{userId}/permissions")
    public ApiResponse<UserPermissionSummaryDto> updateUserPermissions(
            @PathVariable long userId,
            @RequestBody UpdateUserPermissionsRequest request
    ) {
        return ApiResponse.ok(userAdminService.updateUserPermissions(userId, request));
    }

    @PutMapping("/users/{userId}/roles")
    public ApiResponse<UserPermissionSummaryDto> updateUserRoles(
            @PathVariable long userId,
            @RequestBody UpdateUserRolesRequest request
    ) {
        return ApiResponse.ok(userAdminService.updateUserRoles(userId, request));
    }
}
