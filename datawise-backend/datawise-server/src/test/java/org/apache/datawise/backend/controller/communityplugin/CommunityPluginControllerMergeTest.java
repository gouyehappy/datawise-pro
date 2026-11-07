package org.apache.datawise.backend.controller.communityplugin;

import org.apache.datawise.backend.domain.ConnectionConfig;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CommunityPluginControllerMergeTest {

    @Test
    void formPasswordWinsOverEmptyStored() {
        ConnectionConfig form = new ConnectionConfig();
        form.setId("c1");
        form.setPassword("Secret@2024");
        form.setHost("192.0.2.32");
        form.setUser("demo.user");

        ConnectionConfig stored = new ConnectionConfig();
        stored.setId("c1");
        stored.setPassword(null); // decrypt soft-fail
        stored.setHost("192.0.2.32");
        stored.setUser("demo.user");
        stored.setAdvancedConfig("{\"password_source\":\"direct\"}");

        ConnectionConfig merged = CommunityPluginController.mergeFormOverStored(form, stored);
        assertEquals("Secret@2024", merged.getPassword());
        assertEquals("{\"password_source\":\"direct\"}", merged.getAdvancedConfig());
    }

    @Test
    void blankFormPasswordBackfillsFromStore() {
        ConnectionConfig form = new ConnectionConfig();
        form.setId("c1");
        form.setPassword("");
        form.setHost("10.0.0.1");

        ConnectionConfig stored = new ConnectionConfig();
        stored.setId("c1");
        stored.setPassword("stored-secret");
        stored.setHost("10.0.0.2");
        stored.setUser("alice");

        ConnectionConfig merged = CommunityPluginController.mergeFormOverStored(form, stored);
        assertEquals("stored-secret", merged.getPassword());
        assertEquals("10.0.0.1", merged.getHost()); // form host wins
        assertEquals("alice", merged.getUser()); // omitted user backfilled
    }

    @Test
    void secretsMergePrefersFormNonBlankKeys() {
        ConnectionConfig form = new ConnectionConfig();
        form.setSecrets("{\"sudo_password\":\"new-sudo\",\"private_key\":\"\"}");

        ConnectionConfig stored = new ConnectionConfig();
        stored.setSecrets("{\"sudo_password\":\"old-sudo\",\"private_key\":\"PEM\",\"totp_secret\":\"otp\"}");

        ConnectionConfig merged = CommunityPluginController.mergeFormOverStored(form, stored);
        String secrets = merged.getSecrets();
        assertTrue(secrets.contains("\"sudo_password\":\"new-sudo\""));
        assertTrue(secrets.contains("\"private_key\":\"PEM\""));
        assertTrue(secrets.contains("\"totp_secret\":\"otp\""));
    }
}
