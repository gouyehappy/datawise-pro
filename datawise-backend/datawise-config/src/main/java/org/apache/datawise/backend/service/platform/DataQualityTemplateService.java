package org.apache.datawise.backend.service.platform;

import org.apache.datawise.backend.common.support.IdGenerator;
import org.apache.datawise.backend.configstore.DataQualityTemplateStore;
import org.apache.datawise.backend.domain.DataQualityTemplateDto;
import org.apache.datawise.backend.domain.SaveDataQualityTemplateRequest;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.DataQualityTemplateEntity;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
public class DataQualityTemplateService {

    private static final DateTimeFormatter FMT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneId.systemDefault());
    private static final Set<String> ASSERTIONS = Set.of(
            "empty_result",
            "row_count_eq",
            "row_count_lte",
            "scalar_eq",
            "scalar_lte");

    private final DataQualityTemplateStore templateStore;
    private final UserAccessPolicy userAccessPolicy;

    public DataQualityTemplateService(
                                      DataQualityTemplateStore templateStore,
                                      UserAccessPolicy userAccessPolicy) {
        this.templateStore = templateStore;
        this.userAccessPolicy = userAccessPolicy;
    }

    public List<DataQualityTemplateDto> list() {
        userAccessPolicy.requireRegisteredUser();
        return templateStore.listByTenantId(currentTenantId()).stream()
                .sorted(Comparator.comparing(DataQualityTemplateEntity::getUpdatedAt,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::toDto)
                .toList();
    }

    public DataQualityTemplateDto save(SaveDataQualityTemplateRequest request) {
        long userId = userAccessPolicy.requireRegisteredUserId();
        if (request == null) {
            throw new IllegalArgumentException("request is required");
        }
        String name = trimToNull(request.name());
        String sql = trimToNull(request.sql());
        if (name == null || sql == null) {
            throw new IllegalArgumentException("name and sql are required");
        }
        String assertion = normalizeAssertion(request.assertion());
        String tenantId = currentTenantId();
        Instant now = Instant.now();

        DataQualityTemplateEntity entity;
        String id = trimToNull(request.id());
        if (id != null) {
            entity = templateStore.findById(tenantId, id)
                    .orElseThrow(() -> new IllegalArgumentException("Template not found: " + id));
        } else {
            entity = new DataQualityTemplateEntity();
            entity.setId(IdGenerator.shortId("dqshare"));
            entity.setCreatedAt(now);
            entity.setCreatedByUserId(userId);
        }
        entity.setName(name);
        entity.setDescription(nullToEmpty(request.description()));
        entity.setSql(sql);
        entity.setAssertion(assertion);
        entity.setExpected(request.expected() != null ? request.expected().trim() : "0");
        entity.setColumn(nullToEmpty(request.column()));
        entity.setBlocking(Boolean.TRUE.equals(request.blocking()));
        entity.setCronExpression(trimToNull(request.cronExpression()));
        entity.setUpdatedAt(now);
        return toDto(templateStore.save(tenantId, entity));
    }

    public void delete(String id) {
        userAccessPolicy.requireRegisteredUser();
        String normalized = trimToNull(id);
        if (normalized == null) {
            return;
        }
        String tenantId = currentTenantId();
        if (templateStore.findById(tenantId, normalized).isEmpty()) {
            throw new IllegalArgumentException("Template not found: " + normalized);
        }
        templateStore.delete(tenantId, normalized);
    }

    private DataQualityTemplateDto toDto(DataQualityTemplateEntity entity) {
        return new DataQualityTemplateDto(
                entity.getId(),
                entity.getName(),
                entity.getDescription(),
                entity.getSql(),
                entity.getAssertion(),
                entity.getExpected(),
                entity.getColumn(),
                entity.isBlocking(),
                entity.getCronExpression(),
                formatInstant(entity.getCreatedAt()),
                formatInstant(entity.getUpdatedAt()),
                entity.getCreatedByUserId());
    }

    private static String normalizeAssertion(String assertion) {
        String value = assertion == null ? "" : assertion.trim().toLowerCase(Locale.ROOT);
        if (!ASSERTIONS.contains(value)) {
            throw new IllegalArgumentException("Unsupported assertion: " + assertion);
        }
        return value;
    }

    private static String currentTenantId() {
        return TenantIds.normalizeOrDefault(UserContext.getTenantId());
    }

    private static String formatInstant(Instant instant) {
        return instant == null ? null : FMT.format(instant);
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value.trim();
    }
}
