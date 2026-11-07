package org.apache.datawise.backend.common.support;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Regression: community-plugin secret slot must survive connections.xml round-trip.
 * Without {@code plugin-secrets}, migrate-from-advanced + save would permanently drop keys.
 */
class ConnectionsXmlCodecPluginSecretsTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void pluginSecretsRoundTripThroughXml() throws Exception {
        ConnectionGroupEntity group = new ConnectionGroupEntity();
        group.setId("g1");
        group.setLabel("Plugins");
        group.setSortOrder(0);
        group.setExpanded(true);

        ConnectionEntity connection = new ConnectionEntity();
        connection.setId("c1");
        connection.setGroupId("g1");
        connection.setName("SSH");
        connection.setDbType("plugin");
        connection.setPluginId("ssh");
        connection.setAdvancedConfig("{\"host\":\"1.2.3.4\"}");
        connection.setPluginSecrets("{\"private_key\":\"-----BEGIN KEY-----\\nABC\\n-----END KEY-----\"}");

        String xml = ConnectionsXmlCodec.writeToString(List.of(group), List.of(connection), objectMapper);
        assertTrue(xml.contains("plugin-secrets"));
        assertTrue(xml.contains("private_key"));

        ConnectionsXmlCodec.ParsedCatalog parsed = ConnectionsXmlCodec.readXml(xml, objectMapper);
        assertEquals(1, parsed.connections().size());
        ConnectionEntity reloaded = parsed.connections().get(0);
        assertEquals("ssh", reloaded.getPluginId());
        assertEquals("{\"host\":\"1.2.3.4\"}", reloaded.getAdvancedConfig());
        assertEquals(
                "{\"private_key\":\"-----BEGIN KEY-----\\nABC\\n-----END KEY-----\"}",
                reloaded.getPluginSecrets());
    }

    @Test
    void emptySecretsObjectPersistsSoClearIsNotLost() throws Exception {
        ConnectionGroupEntity group = new ConnectionGroupEntity();
        group.setId("g1");
        group.setLabel("G");
        group.setSortOrder(0);
        group.setExpanded(true);

        ConnectionEntity connection = new ConnectionEntity();
        connection.setId("c1");
        connection.setGroupId("g1");
        connection.setName("SSH");
        connection.setDbType("plugin");
        connection.setPluginSecrets("{}");

        String xml = ConnectionsXmlCodec.writeToString(List.of(group), List.of(connection), objectMapper);
        assertTrue(xml.contains("plugin-secrets"));

        ConnectionEntity reloaded = ConnectionsXmlCodec.readXml(xml, objectMapper).connections().get(0);
        assertEquals("{}", reloaded.getPluginSecrets());
    }

    @Test
    void missingPluginSecretsElementReadsAsNull() throws Exception {
        String xml = """
                <?xml version="1.0" encoding="UTF-8"?>
                <datawise-connections version="1">
                  <group id="g1" label="G" sort-order="0" expanded="true">
                    <connection id="c1" name="Old" db-type="plugin" sort-order="0">
                      <plugin-id>ssh</plugin-id>
                    </connection>
                  </group>
                </datawise-connections>
                """;
        ConnectionEntity reloaded = ConnectionsXmlCodec.readXml(xml, objectMapper).connections().get(0);
        assertNull(reloaded.getPluginSecrets());
        assertEquals("ssh", reloaded.getPluginId());
        assertFalse(xml.contains("plugin-secrets"));
    }
}
