package org.apache.datawise.backend.controller.workspace;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.controller.workspace.support.InstanceSqlTreeSyncSupport;
import org.apache.datawise.backend.database.explorer.ExplorerSchemaService;
import org.apache.datawise.backend.domain.InstanceSqlFileDto;
import org.apache.datawise.backend.domain.InstanceSqlHistoryEntryDto;
import org.apache.datawise.backend.domain.ReadInstanceSqlResult;
import org.apache.datawise.backend.domain.RestoreInstanceSqlHistoryRequest;
import org.apache.datawise.backend.domain.RenameInstanceSqlRequest;
import org.apache.datawise.backend.domain.SaveInstanceSqlResult;
import org.apache.datawise.backend.domain.SaveInstanceSqlRequest;
import org.apache.datawise.backend.service.InstanceWorkspaceService;
import org.apache.datawise.backend.common.support.ApiRequestLogger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/workspace/instance-sql")
public class InstanceSqlController {

    private static final Logger log = LoggerFactory.getLogger(InstanceSqlController.class);

    private final InstanceWorkspaceService instanceWorkspaceService;
    private final ExplorerSchemaService schemaService;

    public InstanceSqlController(
            InstanceWorkspaceService instanceWorkspaceService,
            ExplorerSchemaService schemaService
    ) {
        this.instanceWorkspaceService = instanceWorkspaceService;
        this.schemaService = schemaService;
    }

    @PostMapping
    public ApiResponse<SaveInstanceSqlResult> saveInstanceSql(@RequestBody SaveInstanceSqlRequest request)
            throws java.io.IOException {
        int sqlLen = request.sql() != null ? request.sql().length() : 0;
        ApiRequestLogger.logEntry(
                log,
                "POST /api/workspace/instance-sql",
                "connectionId", request.connectionId(),
                "instanceName", request.instanceName(),
                "instanceId", request.instanceId(),
                "fileName", request.fileName(),
                "sqlLen", sqlLen
        );
        try {
            SaveInstanceSqlResult result = instanceWorkspaceService.saveSql(request);
            InstanceSqlTreeSyncSupport.syncExplorerTree(
                    schemaService,
                    log,
                    request.connectionId(),
                    InstanceSqlTreeSyncSupport.resolveInstanceName(request),
                    "POST /api/workspace/instance-sql"
            );
            ApiRequestLogger.logSuccess(
                    log,
                    "POST /api/workspace/instance-sql",
                    "path", result.relativePath()
            );
            return ApiResponse.ok(result);
        } catch (Exception ex) {
            ApiRequestLogger.logFailure(
                    log,
                    "POST /api/workspace/instance-sql",
                    ex,
                    "connectionId", request.connectionId(),
                    "instanceName", request.instanceName()
            );
            throw ex;
        }
    }

    @PutMapping("/rename")
    public ApiResponse<SaveInstanceSqlResult> renameInstanceSql(@RequestBody RenameInstanceSqlRequest request)
            throws java.io.IOException {
        ApiRequestLogger.logEntry(
                log,
                "PUT /api/workspace/instance-sql/rename",
                "connectionId", request.connectionId(),
                "instanceName", request.instanceName(),
                "oldFileName", request.oldFileName(),
                "newFileName", request.newFileName()
        );
        try {
            SaveInstanceSqlResult result = instanceWorkspaceService.renameSqlFile(request);
            InstanceSqlTreeSyncSupport.syncExplorerTree(
                    schemaService,
                    log,
                    request.connectionId(),
                    request.instanceName(),
                    "PUT /api/workspace/instance-sql/rename"
            );
            ApiRequestLogger.logSuccess(
                    log,
                    "PUT /api/workspace/instance-sql/rename",
                    "path", result.relativePath()
            );
            return ApiResponse.ok(result);
        } catch (Exception ex) {
            ApiRequestLogger.logFailure(
                    log,
                    "PUT /api/workspace/instance-sql/rename",
                    ex,
                    "connectionId", request.connectionId(),
                    "instanceName", request.instanceName()
            );
            throw ex;
        }
    }

    @GetMapping("/scripts")
    public ApiResponse<List<InstanceSqlFileDto>> listInstanceSqlScripts(
            @RequestParam(required = false) String connectionId,
            @RequestParam(required = false) String instanceName,
            @RequestParam(defaultValue = "false") boolean allConnections
    ) throws java.io.IOException {
        return ApiResponse.ok(instanceWorkspaceService.listSqlScripts(connectionId, instanceName, allConnections));
    }

    @GetMapping("/latest")
    public ApiResponse<ReadInstanceSqlResult> readLatestInstanceSql(
            @RequestParam String connectionId,
            @RequestParam String instanceName
    ) throws java.io.IOException {
        return ApiResponse.ok(instanceWorkspaceService.readLatestSqlFile(connectionId, instanceName));
    }

    @GetMapping
    public ApiResponse<ReadInstanceSqlResult> readInstanceSql(
            @RequestParam String connectionId,
            @RequestParam String instanceName,
            @RequestParam(defaultValue = "console.sql") String fileName
    ) throws java.io.IOException {
        return ApiResponse.ok(instanceWorkspaceService.readSqlFile(connectionId, instanceName, fileName));
    }

    @GetMapping("/history")
    public ApiResponse<List<InstanceSqlHistoryEntryDto>> listInstanceSqlHistory(
            @RequestParam String connectionId,
            @RequestParam String instanceName,
            @RequestParam String fileName
    ) throws java.io.IOException {
        return ApiResponse.ok(instanceWorkspaceService.listSqlHistory(connectionId, instanceName, fileName));
    }

    @GetMapping("/history/version")
    public ApiResponse<ReadInstanceSqlResult> readInstanceSqlHistoryVersion(
            @RequestParam String connectionId,
            @RequestParam String instanceName,
            @RequestParam String fileName,
            @RequestParam String versionId
    ) throws java.io.IOException {
        return ApiResponse.ok(instanceWorkspaceService.readSqlHistoryVersion(
                connectionId,
                instanceName,
                fileName,
                versionId
        ));
    }

    @PostMapping("/history/restore")
    public ApiResponse<ReadInstanceSqlResult> restoreInstanceSqlHistory(
            @RequestBody RestoreInstanceSqlHistoryRequest request
    ) throws java.io.IOException {
        ApiRequestLogger.logEntry(
                log,
                "POST /api/workspace/instance-sql/history/restore",
                "connectionId", request.connectionId(),
                "instanceName", request.instanceName(),
                "fileName", request.fileName(),
                "versionId", request.versionId()
        );
        try {
            ReadInstanceSqlResult result = instanceWorkspaceService.restoreSqlHistoryVersion(
                    request.connectionId(),
                    request.instanceName(),
                    request.fileName(),
                    request.versionId()
            );
            InstanceSqlTreeSyncSupport.syncExplorerTree(
                    schemaService,
                    log,
                    request.connectionId(),
                    request.instanceName(),
                    "POST /api/workspace/instance-sql/history/restore"
            );
            ApiRequestLogger.logSuccess(log, "POST /api/workspace/instance-sql/history/restore");
            return ApiResponse.ok(result);
        } catch (Exception ex) {
            ApiRequestLogger.logFailure(
                    log,
                    "POST /api/workspace/instance-sql/history/restore",
                    ex,
                    "connectionId", request.connectionId(),
                    "instanceName", request.instanceName(),
                    "fileName", request.fileName()
            );
            throw ex;
        }
    }

    @DeleteMapping
    public ApiResponse<Void> deleteInstanceSql(
            @RequestParam String connectionId,
            @RequestParam String instanceName,
            @RequestParam String fileName
    ) throws java.io.IOException {
        ApiRequestLogger.logEntry(
                log,
                "DELETE /api/workspace/instance-sql",
                "connectionId", connectionId,
                "instanceName", instanceName,
                "fileName", fileName
        );
        try {
            instanceWorkspaceService.deleteSqlFile(connectionId, instanceName, fileName);
            InstanceSqlTreeSyncSupport.syncExplorerTree(
                    schemaService,
                    log,
                    connectionId,
                    instanceName,
                    "DELETE /api/workspace/instance-sql"
            );
            ApiRequestLogger.logSuccess(log, "DELETE /api/workspace/instance-sql");
            return ApiResponse.ok(null);
        } catch (Exception ex) {
            ApiRequestLogger.logFailure(
                    log,
                    "DELETE /api/workspace/instance-sql",
                    ex,
                    "connectionId", connectionId,
                    "instanceName", instanceName,
                    "fileName", fileName
            );
            throw ex;
        }
    }
}
