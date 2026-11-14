package org.apache.datawise.backend.controller.workspace;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.common.pack.ViewModelLineageHooks;
import org.apache.datawise.backend.common.support.ApiRequestLogger;
import org.apache.datawise.backend.common.support.SqlContentHash;
import org.apache.datawise.backend.controller.workspace.support.ViewModelTreeSyncSupport;
import org.apache.datawise.backend.database.explorer.ExplorerSchemaService;
import org.apache.datawise.backend.domain.PushNotificationRequest;
import org.apache.datawise.backend.domain.ReadViewModelResult;
import org.apache.datawise.backend.domain.RenameViewModelRequest;
import org.apache.datawise.backend.domain.SaveViewModelRequest;
import org.apache.datawise.backend.domain.SaveViewModelResult;
import org.apache.datawise.backend.domain.ViewModelFileDto;
import org.apache.datawise.backend.service.ViewModelService;
import org.apache.datawise.backend.service.workspace.WorkspaceNotificationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.apache.datawise.backend.domain.UserFeaturePermission;
import org.apache.datawise.backend.security.RequiresFeature;

@RestController
@RequestMapping("/api/workspace/view-models")
@RequiresFeature(UserFeaturePermission.WORKBENCH_CONSOLE_VIEW_MODEL)
public class ViewModelController {

    private static final Logger log = LoggerFactory.getLogger(ViewModelController.class);

    private final ViewModelService viewModelService;
    private final ExplorerSchemaService schemaService;
    private final ObjectProvider<ViewModelLineageHooks> lineageHooks;
    private final WorkspaceNotificationService notificationService;

    public ViewModelController(
            ViewModelService viewModelService,
            ExplorerSchemaService schemaService,
            ObjectProvider<ViewModelLineageHooks> lineageHooks,
            WorkspaceNotificationService notificationService
    ) {
        this.viewModelService = viewModelService;
        this.schemaService = schemaService;
        this.lineageHooks = lineageHooks;
        this.notificationService = notificationService;
    }

    @PostMapping("/draft")
    public ApiResponse<SaveViewModelResult> saveDraft(@RequestBody SaveViewModelRequest request)
            throws java.io.IOException {
        SaveViewModelResult result = viewModelService.saveDraft(request);
        ViewModelTreeSyncSupport.syncExplorerTree(
                schemaService,
                log,
                request.connectionId(),
                ViewModelTreeSyncSupport.resolveInstanceName(request),
                "POST /api/workspace/view-models/draft"
        );
        return ApiResponse.ok(result);
    }

    @PostMapping
    public ApiResponse<SaveViewModelResult> save(@RequestBody SaveViewModelRequest request) throws java.io.IOException {
        ApiRequestLogger.logEntry(
                log,
                "POST /api/workspace/view-models",
                "connectionId", request.connectionId(),
                "instanceName", request.instanceName(),
                "name", request.name()
        );
        try {
            String instanceName = ViewModelTreeSyncSupport.resolveInstanceName(request);
            String previousSql = readExistingSqlQuietly(request.connectionId(), instanceName, request.name());
            SaveViewModelResult result = viewModelService.save(request);
            ViewModelLineageHooks hooks = lineageHooks.getIfAvailable();
            if (hooks != null) {
                hooks.parseAndPersist(
                        request.connectionId(),
                        instanceName,
                        result.fileName(),
                        result.name(),
                        request.sql(),
                        null
                );
            }
            notifyDownstreamIfSqlChanged(request.connectionId(), instanceName, result.name(), previousSql, request.sql());
            ViewModelTreeSyncSupport.syncExplorerTree(
                    schemaService,
                    log,
                    request.connectionId(),
                    ViewModelTreeSyncSupport.resolveInstanceName(request),
                    "POST /api/workspace/view-models"
            );
            return ApiResponse.ok(result);
        } catch (Exception ex) {
            ApiRequestLogger.logFailure(
                    log,
                    "POST /api/workspace/view-models",
                    ex,
                    "connectionId", request.connectionId(),
                    "instanceName", request.instanceName()
            );
            throw ex;
        }
    }

    @PutMapping("/rename")
    public ApiResponse<SaveViewModelResult> rename(@RequestBody RenameViewModelRequest request)
            throws java.io.IOException {
        SaveViewModelResult result = viewModelService.rename(request);
        ViewModelTreeSyncSupport.syncExplorerTree(
                schemaService,
                log,
                request.connectionId(),
                request.instanceName(),
                "PUT /api/workspace/view-models/rename"
        );
        return ApiResponse.ok(result);
    }

    @GetMapping("/scripts")
    public ApiResponse<List<ViewModelFileDto>> listScripts(
            @RequestParam String connectionId,
            @RequestParam String instanceName
    ) throws java.io.IOException {
        return ApiResponse.ok(viewModelService.listViewModels(connectionId, instanceName));
    }

    @GetMapping
    public ApiResponse<ReadViewModelResult> read(
            @RequestParam String connectionId,
            @RequestParam String instanceName,
            @RequestParam String name
    ) throws java.io.IOException {
        return ApiResponse.ok(viewModelService.read(connectionId, instanceName, name));
    }

    @DeleteMapping
    public ApiResponse<Void> delete(
            @RequestParam String connectionId,
            @RequestParam String instanceName,
            @RequestParam String name
    ) throws java.io.IOException {
        viewModelService.delete(connectionId, instanceName, name);
        ViewModelLineageHooks hooks = lineageHooks.getIfAvailable();
        if (hooks != null) {
            hooks.deleteSidecar(connectionId, instanceName, name);
        }
        ViewModelTreeSyncSupport.syncExplorerTree(
                schemaService,
                log,
                connectionId,
                instanceName,
                "DELETE /api/workspace/view-models"
        );
        return ApiResponse.ok(null);
    }

    private String readExistingSqlQuietly(String connectionId, String instanceName, String name) {
        try {
            return viewModelService.read(connectionId, instanceName, name).sql();
        } catch (Exception ex) {
            return null;
        }
    }

    private void notifyDownstreamIfSqlChanged(
            String connectionId,
            String instanceName,
            String modelName,
            String previousSql,
            String currentSql
    ) {
        if (previousSql == null || currentSql == null) {
            return;
        }
        if (SqlContentHash.sha256(previousSql).equals(SqlContentHash.sha256(currentSql))) {
            return;
        }
        ViewModelLineageHooks hooks = lineageHooks.getIfAvailable();
        if (hooks == null) {
            return;
        }
        try {
            var impact = hooks.findDownstreamImpact(connectionId, instanceName, modelName);
            if (impact.downstream().isEmpty()) {
                return;
            }
            String downstream = impact.downstream().stream()
                    .map(item -> item.modelName())
                    .collect(Collectors.joining(", "));
            notificationService.pushNotification(new PushNotificationRequest(
                    "workspace",
                    "viewModelLineageChanged",
                    "viewModelLineageChanged",
                    Map.of(
                            "name", modelName,
                            "downstream", downstream,
                            "count", impact.downstream().size()
                    )
            ));
        } catch (Exception ex) {
            ApiRequestLogger.logFailure(
                    log,
                    "view-model lineage impact notification",
                    ex,
                    "connectionId", connectionId,
                    "instanceName", instanceName,
                    "name", modelName
            );
        }
    }
}
