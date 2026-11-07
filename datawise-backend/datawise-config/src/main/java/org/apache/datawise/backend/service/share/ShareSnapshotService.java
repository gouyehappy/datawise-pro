package org.apache.datawise.backend.service.share;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.support.IdGenerator;
import org.apache.datawise.backend.configstore.ShareSnapshotStore;
import org.apache.datawise.backend.domain.CreateShareRequest;
import org.apache.datawise.backend.domain.CreateShareResultDto;
import org.apache.datawise.backend.domain.PublicShareDto;
import org.apache.datawise.backend.domain.ShareSnapshotDto;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.ShareSnapshotEntity;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;

@Service
public class ShareSnapshotService {

    public static final int DEFAULT_EXPIRES_DAYS = 30;
    public static final int MAX_EXPIRES_DAYS = 90;
    public static final int MAX_PAYLOAD_CHARS = 1_500_000;
    private static final int MAX_ROWS = 500;

    private final ShareSnapshotStore shareStore;
    private final UserAccessPolicy userAccessPolicy;
    private final PasswordEncoder passwordEncoder;
    private final ObjectMapper objectMapper;
    private final SecureRandom secureRandom = new SecureRandom();

    public ShareSnapshotService(
                                ShareSnapshotStore shareStore,
                                UserAccessPolicy userAccessPolicy,
                                PasswordEncoder passwordEncoder,
                                ObjectMapper objectMapper) {
        this.shareStore = shareStore;
        this.userAccessPolicy = userAccessPolicy;
        this.passwordEncoder = passwordEncoder;
        this.objectMapper = objectMapper;
    }

    public CreateShareResultDto create(CreateShareRequest request) {
        long userId = userAccessPolicy.requireRegisteredUserId();
        if (request == null || request.payloadJson() == null || request.payloadJson().isBlank()) {
            throw new IllegalArgumentException("payloadJson is required");
        }
        String payloadJson = request.payloadJson().trim();
        if (payloadJson.length() > MAX_PAYLOAD_CHARS) {
            throw new IllegalArgumentException("payloadJson is too large");
        }
        validatePayload(payloadJson);

        String kind = request.kind() != null && !request.kind().isBlank()
                ? request.kind().trim()
                : ShareSnapshotEntity.KIND_DASHBOARD_CHART;
        if (!ShareSnapshotEntity.KIND_DASHBOARD_CHART.equals(kind)) {
            throw new IllegalArgumentException("unsupported share kind: " + kind);
        }

        String title = request.title() != null && !request.title().isBlank()
                ? request.title().trim()
                : "Shared chart";
        int days = request.expiresInDays() != null ? request.expiresInDays() : DEFAULT_EXPIRES_DAYS;
        days = Math.max(1, Math.min(MAX_EXPIRES_DAYS, days));

        String rawToken = "dws_" + randomHex(24);
        Instant now = Instant.now();
        ShareSnapshotEntity entity = new ShareSnapshotEntity();
        entity.setId(IdGenerator.shortId("share-"));
        entity.setTenantId(TenantIds.normalizeOrDefault(UserContext.getTenantId()));
        entity.setCreatedBy(userId);
        entity.setTitle(title);
        entity.setKind(kind);
        entity.setTokenHash(passwordEncoder.encode(rawToken));
        entity.setTokenLookup(tokenLookupDigest(rawToken));
        entity.setPayloadJson(payloadJson);
        entity.setExpiresAt(now.plus(days, ChronoUnit.DAYS));
        entity.setCreatedAt(now);
        entity.setRevoked(false);
        shareStore.save(entity);

        return new CreateShareResultDto(
                entity.getId(),
                rawToken,
                entity.getTitle(),
                entity.getKind(),
                entity.getExpiresAt(),
                entity.getCreatedAt(),
                "/share/" + rawToken);
    }

    public List<ShareSnapshotDto> listMine() {
        long userId = userAccessPolicy.requireRegisteredUserId();
        String tenantId = TenantIds.normalizeOrDefault(UserContext.getTenantId());
        return shareStore.listAll().stream()
                .filter(item -> userId == (item.getCreatedBy() != null ? item.getCreatedBy() : -1L))
                .filter(item -> tenantId.equals(TenantIds.normalizeOrDefault(item.getTenantId())))
                .sorted(Comparator.comparing(ShareSnapshotEntity::getCreatedAt,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::toDto)
                .toList();
    }

    public void revoke(String id) {
        long userId = userAccessPolicy.requireRegisteredUserId();
        ShareSnapshotEntity entity = shareStore.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("share not found"));
        if (entity.getCreatedBy() == null || entity.getCreatedBy() != userId) {
            throw new IllegalArgumentException("share not found");
        }
        entity.setRevoked(true);
        shareStore.save(entity);
    }

    public PublicShareDto resolvePublic(String rawToken) {
        ShareSnapshotEntity entity = authenticateToken(rawToken)
                .orElseThrow(() -> new IllegalArgumentException("share not found"));
        if (entity.isRevoked()) {
            throw new IllegalArgumentException("share not found");
        }
        if (entity.getExpiresAt() != null && entity.getExpiresAt().isBefore(Instant.now())) {
            throw new IllegalArgumentException("share not found");
        }
        return new PublicShareDto(
                entity.getTitle(),
                entity.getKind(),
                entity.getPayloadJson(),
                entity.getExpiresAt());
    }

    private java.util.Optional<ShareSnapshotEntity> authenticateToken(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return java.util.Optional.empty();
        }
        String token = rawToken.trim();
        String lookup = tokenLookupDigest(token);
        return shareStore.findByTokenLookup(lookup)
                .filter(entity -> entity.getTokenHash() != null
                        && passwordEncoder.matches(token, entity.getTokenHash()));
    }

    private void validatePayload(String payloadJson) {
        try {
            JsonNode root = objectMapper.readTree(payloadJson);
            if (!root.isObject()) {
                throw new IllegalArgumentException("payloadJson must be an object");
            }
            JsonNode rows = root.get("rows");
            if (rows != null && rows.isArray() && rows.size() > MAX_ROWS) {
                throw new IllegalArgumentException("share payload exceeds " + MAX_ROWS + " rows");
            }
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalArgumentException("payloadJson is invalid JSON");
        }
    }

    private ShareSnapshotDto toDto(ShareSnapshotEntity entity) {
        return new ShareSnapshotDto(
                entity.getId(),
                entity.getTitle(),
                entity.getKind(),
                entity.getExpiresAt(),
                entity.getCreatedAt(),
                entity.isRevoked());
    }

    private String randomHex(int bytes) {
        byte[] buf = new byte[bytes];
        secureRandom.nextBytes(buf);
        return HexFormat.of().formatHex(buf);
    }

    static String tokenLookupDigest(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashed = digest.digest(rawToken.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hashed);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 not available", ex);
        }
    }
}
