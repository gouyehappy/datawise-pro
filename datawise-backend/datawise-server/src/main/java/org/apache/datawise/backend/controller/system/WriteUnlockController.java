package org.apache.datawise.backend.controller.system;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.WriteUnlockService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

/**
 * UI-session write unlock endpoints (T-SAFE-1). API tokens receive 401 from the service.
 */
@RestController
@RequestMapping("/api/connections/{connectionId}/write-unlock")
public class WriteUnlockController {

    private final WriteUnlockService writeUnlockService;

    public WriteUnlockController(WriteUnlockService writeUnlockService) {
        this.writeUnlockService = writeUnlockService;
    }

    @GetMapping
    public ApiResponse<WriteUnlockService.UnlockStatus> current(@PathVariable String connectionId) {
        Long userId = UserContext.requireUserId();
        return writeUnlockService.current(userId, connectionId)
                .map(ApiResponse::ok)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    @PostMapping
    public ApiResponse<WriteUnlockService.UnlockStatus> unlock(
            @PathVariable String connectionId,
            @RequestBody UnlockRequest body) {
        Long userId = UserContext.requireUserId();
        int durationSec = body != null && body.durationSec() != null ? body.durationSec() : 60;
        try {
            return ApiResponse.ok(writeUnlockService.unlock(userId, connectionId, durationSec));
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage());
        }
    }

    @DeleteMapping
    public ApiResponse<Map<String, Boolean>> clear(@PathVariable String connectionId) {
        Long userId = UserContext.requireUserId();
        writeUnlockService.clear(userId, connectionId);
        return ApiResponse.ok(Map.of("cleared", true));
    }

    public record UnlockRequest(Integer durationSec) {
    }
}
