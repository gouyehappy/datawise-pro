package org.apache.datawise.backend.service;

import org.apache.datawise.backend.service.instancesql.InstanceSqlCatalogService;
import org.apache.datawise.backend.service.instancesql.InstanceSqlFileService;
import org.apache.datawise.backend.service.instancesql.InstanceSqlHistoryService;
import org.apache.datawise.backend.service.instancesql.InstanceSqlWorkspaceSupport;

import java.nio.file.Path;

/** Wires instance SQL services for unit tests without Spring. */
public final class InstanceWorkspaceAssembly {

    private InstanceWorkspaceAssembly() {
    }

    public static InstanceWorkspaceService forTest(Path baseDir) {
        WorkspaceScriptsRootService scriptsRoot = new WorkspaceScriptsRootService(baseDir);
        InstanceSqlWorkspaceSupport workspaceSupport = new InstanceSqlWorkspaceSupport(scriptsRoot);
        InstanceSqlHistoryService history = new InstanceSqlHistoryService(workspaceSupport, null);
        InstanceSqlFileService file = new InstanceSqlFileService(workspaceSupport, history, null);
        InstanceSqlCatalogService catalog = new InstanceSqlCatalogService(workspaceSupport);
        return new InstanceWorkspaceService(scriptsRoot, file, history, catalog);
    }
}
