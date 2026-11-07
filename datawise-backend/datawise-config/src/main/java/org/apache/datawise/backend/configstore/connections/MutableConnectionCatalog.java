package org.apache.datawise.backend.configstore.connections;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;
import org.apache.datawise.backend.common.support.ConnectionsXmlCodec;

import java.util.ArrayList;
import java.util.List;

public final class MutableConnectionCatalog {

    private final List<ConnectionGroupEntity> groups;
    private final List<ConnectionEntity> connections;

    private MutableConnectionCatalog(List<ConnectionGroupEntity> groups, List<ConnectionEntity> connections) {
        this.groups = groups;
        this.connections = connections;
    }

    public static MutableConnectionCatalog from(ConnectionsXmlCodec.ParsedCatalog catalog) {
        return new MutableConnectionCatalog(
                new ArrayList<>(catalog.groups()),
                new ArrayList<>(catalog.connections()));
    }

    public List<ConnectionGroupEntity> groups() {
        return groups;
    }

    public List<ConnectionEntity> connections() {
        return connections;
    }
}
