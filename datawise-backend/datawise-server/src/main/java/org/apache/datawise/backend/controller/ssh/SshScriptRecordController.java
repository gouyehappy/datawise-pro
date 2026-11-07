package org.apache.datawise.backend.controller.ssh;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.model.SshScriptRecord;
import org.apache.datawise.backend.service.ssh.SshScriptRecordService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/ssh/script-records")
public class SshScriptRecordController {

    private final SshScriptRecordService scriptRecordService;

    public SshScriptRecordController(SshScriptRecordService scriptRecordService) {
        this.scriptRecordService = scriptRecordService;
    }

    @GetMapping
    public ApiResponse<List<SshScriptRecord>> list(@RequestParam String connectionId) {
        return ApiResponse.ok(scriptRecordService.list(connectionId));
    }

    @PostMapping
    public ApiResponse<SshScriptRecord> save(@RequestBody SaveSshScriptRecordRequest request) {
        return ApiResponse.ok(scriptRecordService.save(requireRequest(request)));
    }

    @PutMapping
    public ApiResponse<SshScriptRecord> savePut(@RequestBody SaveSshScriptRecordRequest request) {
        return ApiResponse.ok(scriptRecordService.save(requireRequest(request)));
    }

    @DeleteMapping("/{recordId}")
    public ApiResponse<Void> delete(
            @PathVariable String recordId,
            @RequestParam String connectionId
    ) {
        scriptRecordService.delete(connectionId, recordId);
        return ApiResponse.ok(null);
    }

    private SshScriptRecordService.SaveCommand requireRequest(SaveSshScriptRecordRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("request body is required");
        }
        if (request.connectionId() == null || request.connectionId().isBlank()) {
            throw new IllegalArgumentException("connectionId is required");
        }
        if (request.entry() == null) {
            throw new IllegalArgumentException("entry is required");
        }
        return new SshScriptRecordService.SaveCommand(request.connectionId(), request.entry());
    }

    public record SaveSshScriptRecordRequest(String connectionId, SshScriptRecord entry) {
    }
}
