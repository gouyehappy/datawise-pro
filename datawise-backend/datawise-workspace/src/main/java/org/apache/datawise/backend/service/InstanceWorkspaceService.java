package org.apache.datawise.backend.service;

import org.apache.datawise.backend.domain.InstanceSqlFileDto;
import org.apache.datawise.backend.domain.InstanceSqlHistoryEntryDto;
import org.apache.datawise.backend.domain.ReadInstanceSqlResult;
import org.apache.datawise.backend.domain.RenameInstanceSqlRequest;
import org.apache.datawise.backend.domain.SaveInstanceSqlRequest;
import org.apache.datawise.backend.domain.SaveInstanceSqlResult;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.service.instancesql.InstanceSqlCatalogService;
import org.apache.datawise.backend.service.instancesql.InstanceSqlFileService;
import org.apache.datawise.backend.service.instancesql.InstanceSqlHistoryService;
import org.apache.datawise.backend.service.instancesql.InstanceSqlWorkspaceSupport;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.List;

/**
 * Backward-compatible facade for per-instance SQL workspace operations.
 */
@Service
public class InstanceWorkspaceService {

    private final WorkspaceScriptsRootService scriptsRootService;
    private final InstanceSqlFileService fileService;
    private final InstanceSqlHistoryService historyService;
    private final InstanceSqlCatalogService catalogService;

    @Autowired
    public InstanceWorkspaceService(
            WorkspaceScriptsRootService scriptsRootService,
            InstanceSqlFileService fileService,
            InstanceSqlHistoryService historyService,
            InstanceSqlCatalogService catalogService
    ) {
        this.scriptsRootService = scriptsRootService;
        this.fileService = fileService;
        this.historyService = historyService;
        this.catalogService = catalogService;
    }

    public String scriptsRoot() {
        return scriptsRootService.scriptsRoot();
    }

    public SaveInstanceSqlResult saveSql(SaveInstanceSqlRequest request) throws IOException {
        return fileService.saveSql(request);
    }

    public SaveInstanceSqlResult renameSqlFile(RenameInstanceSqlRequest request) throws IOException {
        return fileService.renameSqlFile(request);
    }

    public void deleteSqlFile(String connectionId, String instanceName, String fileName) throws IOException {
        fileService.deleteSqlFile(connectionId, instanceName, fileName);
    }

    public ReadInstanceSqlResult readSqlFile(String connectionId, String instanceName, String fileName)
            throws IOException {
        return fileService.readSqlFile(connectionId, instanceName, fileName);
    }

    public ReadInstanceSqlResult readLatestSqlFile(String connectionId, String instanceName) throws IOException {
        return fileService.readLatestSqlFile(connectionId, instanceName);
    }

    public List<TreeNode> listSqlFileNodes(String connectionId, String instanceName) throws IOException {
        return catalogService.listSqlFileNodes(connectionId, instanceName);
    }

    public List<InstanceSqlFileDto> listSqlScripts(
            String connectionId,
            String instanceName,
            boolean allConnections
    ) throws IOException {
        return catalogService.listSqlScripts(connectionId, instanceName, allConnections);
    }

    public TreeNode buildWorkspacesFolderNode(String connectionId, String catalog) {
        return catalogService.buildWorkspacesFolderNode(connectionId, catalog);
    }

    public String readSql(String connectionId, String instanceName, String fileName) throws IOException {
        return fileService.readSql(connectionId, instanceName, fileName);
    }

    public List<InstanceSqlHistoryEntryDto> listSqlHistory(
            String connectionId,
            String instanceName,
            String fileName
    ) throws IOException {
        return historyService.listSqlHistory(connectionId, instanceName, fileName);
    }

    public ReadInstanceSqlResult readSqlHistoryVersion(
            String connectionId,
            String instanceName,
            String fileName,
            String versionId
    ) throws IOException {
        return historyService.readSqlHistoryVersion(connectionId, instanceName, fileName, versionId);
    }

    public ReadInstanceSqlResult restoreSqlHistoryVersion(
            String connectionId,
            String instanceName,
            String fileName,
            String versionId
    ) throws IOException {
        return historyService.restoreSqlHistoryVersion(connectionId, instanceName, fileName, versionId);
    }
}
