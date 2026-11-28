package org.apache.datawise.backend.common.support;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Regression: nested connection groups must keep parentId across connections.xml round-trip.
 * Write nests child {@code <group>} under parent; parse must restore parentId from that structure.
 */
class ConnectionsXmlCodecNestedGroupTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void nestedGroupParentIdSurvivesXmlRoundTrip() throws Exception {
        ConnectionGroupEntity root = group("sdp", "sdp", null, 0);
        ConnectionGroupEntity child = group("new", "new", "sdp", 0);

        ConnectionEntity underRoot = connection("c-root", "sdp", "RootConn");
        ConnectionEntity underChild = connection("c-child", "new", "ChildConn");

        String xml = ConnectionsXmlCodec.writeToString(
                List.of(root, child),
                List.of(underRoot, underChild),
                objectMapper);
        assertTrue(xml.contains("id=\"sdp\""));
        assertTrue(xml.contains("id=\"new\""));

        ConnectionsXmlCodec.ParsedCatalog parsed = ConnectionsXmlCodec.readXml(xml, objectMapper);
        Map<String, ConnectionGroupEntity> byId = parsed.groups().stream()
                .collect(Collectors.toMap(ConnectionGroupEntity::getId, Function.identity()));

        assertEquals(2, byId.size());
        assertNull(byId.get("sdp").getParentId());
        assertEquals("sdp", byId.get("new").getParentId());

        Map<String, ConnectionEntity> connections = parsed.connections().stream()
                .collect(Collectors.toMap(ConnectionEntity::getId, Function.identity()));
        assertEquals("sdp", connections.get("c-root").getGroupId());
        assertEquals("new", connections.get("c-child").getGroupId());
    }

    @Test
    void nestedGroupParentIdRestoredFromStructuralXmlWithoutAttribute() throws Exception {
        String xml = """
                <?xml version="1.0" encoding="UTF-8"?>
                <datawise-connections version="1">
                  <group id="sdp" label="sdp" sort-order="0" expanded="false">
                    <group id="new" label="new" sort-order="0" expanded="false"/>
                  </group>
                </datawise-connections>
                """;

        ConnectionsXmlCodec.ParsedCatalog parsed = ConnectionsXmlCodec.readXml(xml, objectMapper);
        Map<String, ConnectionGroupEntity> byId = parsed.groups().stream()
                .collect(Collectors.toMap(ConnectionGroupEntity::getId, Function.identity()));

        assertNull(byId.get("sdp").getParentId());
        assertEquals("sdp", byId.get("new").getParentId());
    }

    private static ConnectionGroupEntity group(String id, String label, String parentId, int sortOrder) {
        ConnectionGroupEntity group = new ConnectionGroupEntity();
        group.setId(id);
        group.setLabel(label);
        group.setParentId(parentId);
        group.setSortOrder(sortOrder);
        group.setExpanded(false);
        return group;
    }

    private static ConnectionEntity connection(String id, String groupId, String name) {
        ConnectionEntity connection = new ConnectionEntity();
        connection.setId(id);
        connection.setGroupId(groupId);
        connection.setName(name);
        connection.setDbType("mysql");
        connection.setSortOrder(0);
        return connection;
    }
}
