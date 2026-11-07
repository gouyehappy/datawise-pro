package org.apache.datawise.backend.controller.workspace.support;

import org.apache.datawise.backend.database.explorer.ExplorerSchemaService;
import org.apache.datawise.backend.domain.SaveViewModelRequest;
import org.slf4j.Logger;

/** 视图模型变更后同步 Explorer views 文件夹缓存。 */
public final class ViewModelTreeSyncSupport {

    private ViewModelTreeSyncSupport() {
    }

    public static String resolveInstanceName(SaveViewModelRequest request) {
        if (request.instanceName() != null && !request.instanceName().isBlank()) {
            return request.instanceName().trim();
        }
        if (request.instanceId() != null && !request.instanceId().isBlank()) {
            return request.instanceId().trim();
        }
        return "";
    }

    public static void syncExplorerTree(
            ExplorerSchemaService schemaService,
            Logger log,
            String connectionId,
            String instanceName,
            String operationLabel
    ) {
        String instance = instanceName != null ? instanceName.trim() : "";
        if (instance.isBlank()) {
            return;
        }
        try {
            schemaService.syncViewModelsInCache(connectionId, instance);
        } catch (Exception syncEx) {
            log.warn(
                    "{} tree sync skipped connectionId={} instanceName={}: {}",
                    operationLabel,
                    connectionId,
                    instance,
                    syncEx.getMessage()
            );
        }
    }
}
