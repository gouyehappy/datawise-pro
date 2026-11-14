package org.apache.datawise.backend.controller.system;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.WriteUnlockService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Session-scoped write-unlock teardown (T-SAFE-1 logout / beforeunload).
 */
@RestController
@RequestMapping("/api/connections/write-unlock")
public class WriteUnlockSessionController {

    private final WriteUnlockService writeUnlockService;

    public WriteUnlockSessionController(WriteUnlockService writeUnlockService) {
        this.writeUnlockService = writeUnlockService;
    }

    @DeleteMapping
    public ApiResponse<Map<String, Integer>> clearAll() {
        Long userId = UserContext.requireUserId();
        int cleared = writeUnlockService.clearAllForUser(userId);
        return ApiResponse.ok(Map.of("cleared", cleared));
    }
}
