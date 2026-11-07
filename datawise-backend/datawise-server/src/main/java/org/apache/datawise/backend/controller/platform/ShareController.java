package org.apache.datawise.backend.controller.platform;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.CreateShareRequest;
import org.apache.datawise.backend.domain.CreateShareResultDto;
import org.apache.datawise.backend.domain.ShareSnapshotDto;
import org.apache.datawise.backend.service.share.ShareSnapshotService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/shares")
public class ShareController {

    private final ShareSnapshotService shareSnapshotService;

    public ShareController(ShareSnapshotService shareSnapshotService) {
        this.shareSnapshotService = shareSnapshotService;
    }

    @GetMapping
    public ApiResponse<List<ShareSnapshotDto>> listMine() {
        return ApiResponse.ok(shareSnapshotService.listMine());
    }

    @PostMapping
    public ApiResponse<CreateShareResultDto> create(@RequestBody CreateShareRequest request) {
        return ApiResponse.ok(shareSnapshotService.create(request));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> revoke(@PathVariable String id) {
        shareSnapshotService.revoke(id);
        return ApiResponse.ok(null);
    }
}
