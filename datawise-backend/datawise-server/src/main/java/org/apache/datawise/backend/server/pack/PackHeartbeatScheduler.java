package org.apache.datawise.backend.server.pack;

import org.apache.datawise.backend.config.EntitlementProperties;
import org.apache.datawise.backend.domain.pack.LicenseDocument;
import org.apache.datawise.backend.domain.pack.PackAuditActions;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

/**
 * Optional notarization heartbeat. Disabled unless {@code datawise.entitlement.heartbeat-url} is set.
 * Failures are audited and never block the workbench.
 */
@Component
public class PackHeartbeatScheduler {

    private static final Logger log = LoggerFactory.getLogger(PackHeartbeatScheduler.class);

    private final EntitlementProperties properties;
    private final PackStateStore stateStore;
    private final PackAuditService auditService;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    public PackHeartbeatScheduler(
            EntitlementProperties properties,
            PackStateStore stateStore,
            PackAuditService auditService
    ) {
        this.properties = properties;
        this.stateStore = stateStore;
        this.auditService = auditService;
    }

    @Scheduled(fixedDelayString = "${datawise.entitlement.heartbeat-check-ms:3600000}")
    public void tick() {
        if (!properties.isHeartbeatConfigured() || properties.isOpen()) {
            return;
        }
        if (!due()) {
            return;
        }
        String url = properties.getHeartbeatUrl().trim();
        String siteId = stateStore.readLicense().map(LicenseDocument::siteId).orElse("unknown");
        try {
            String body = "{\"siteId\":\"" + escape(siteId) + "\",\"product\":\"datawise\",\"at\":\""
                    + Instant.now() + "\"}";
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(10))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            stateStore.writeHeartbeatAt(Instant.now().toString());
            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                auditService.record(PackAuditActions.HEARTBEAT_OK, null, "status=" + response.statusCode());
            } else {
                auditService.record(PackAuditActions.HEARTBEAT_FAIL, null, "status=" + response.statusCode());
            }
        } catch (Exception ex) {
            log.debug("pack.heartbeat.failed url={} | {}", url, ex.getMessage());
            try {
                stateStore.writeHeartbeatAt(Instant.now().toString());
            } catch (Exception ignored) {
                // best-effort
            }
            auditService.record(PackAuditActions.HEARTBEAT_FAIL, null, ex.getMessage());
        }
    }

    private boolean due() {
        int hours = Math.max(1, properties.getHeartbeatIntervalHours());
        Optional<String> last = stateStore.readHeartbeatAt();
        if (last.isEmpty()) {
            return true;
        }
        try {
            Instant at = Instant.parse(last.get());
            return at.plus(Duration.ofHours(hours)).isBefore(Instant.now());
        } catch (Exception ex) {
            return true;
        }
    }

    private static String escape(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
