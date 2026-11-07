package org.apache.datawise.backend.configstore;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

/** Connection catalog scoped to the current tenant (file or jdbc backend). */
public interface ConnectionStore {

    void ensureTenantFiles(String tenantId);

    Path connectionsFilePath();

    String readConnectionsXml() throws Exception;

    List<ConnectionGroupEntity> findAllGroups();

    List<ConnectionEntity> findAllConnections();

    List<ConnectionGroupEntity> findRootGroups();

    List<ConnectionGroupEntity> findChildGroups(String parentId);

    void replaceAll(List<ConnectionGroupEntity> groups, List<ConnectionEntity> connections);

    void importConnectionsXml(String xml) throws IOException;

    Optional<ConnectionGroupEntity> findGroupById(String groupId);

    ConnectionGroupEntity saveGroup(ConnectionGroupEntity group);

    void deleteGroupById(String groupId);

    Optional<ConnectionEntity> findConnectionById(String connectionId);

    List<ConnectionEntity> findConnectionsByGroupId(String groupId);

    ConnectionEntity saveConnection(ConnectionEntity connection);

    void deleteConnectionById(String connectionId);

    int migratePlaintextSecretsIfNeeded();
}
