package org.apache.datawise.backend.service.share;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.FileShareSnapshotStore;
import org.apache.datawise.backend.domain.CreateShareRequest;
import org.apache.datawise.backend.domain.CreateShareResultDto;
import org.apache.datawise.backend.domain.PublicShareDto;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ShareSnapshotServiceTest {

    @TempDir
    Path tempDir;

    private ShareSnapshotService service;

    @BeforeEach
    void setUp() {
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        service = new ShareSnapshotService(
                new FileShareSnapshotStore(configDirectory, mapper),
                new UserAccessPolicy(),
                new BCryptPasswordEncoder(),
                mapper);
        UserContext.set(3L, false, "session-1", "default");
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void createAndResolvePublicShare() {
        CreateShareResultDto created = service.create(new CreateShareRequest(
                "Revenue",
                "dashboard_chart",
                "{\"columns\":[{\"name\":\"day\"}],\"rows\":[{\"day\":\"Mon\"}],\"config\":{\"chartType\":\"bar\",\"xField\":\"day\",\"yFields\":[\"v\"]}}",
                7));
        assertTrue(created.token().startsWith("dws_"));
        assertEquals("/share/" + created.token(), created.path());

        PublicShareDto pub = service.resolvePublic(created.token());
        assertEquals("Revenue", pub.title());
        assertTrue(pub.payloadJson().contains("Mon"));
    }

    @Test
    void revokeHidesShare() {
        CreateShareResultDto created = service.create(new CreateShareRequest(
                "Hidden",
                null,
                "{\"rows\":[]}",
                null));
        service.revoke(created.id());
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> service.resolvePublic(created.token()));
        assertEquals("share not found", ex.getMessage());
    }
}
