package org.apache.datawise.backend.service.platform;

import org.apache.datawise.backend.configstore.DataQualityTemplateStore;
import org.apache.datawise.backend.domain.SaveDataQualityTemplateRequest;
import org.apache.datawise.backend.model.DataQualityTemplateEntity;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DataQualityTemplateServiceTest {

    @Mock
    private DataQualityTemplateStore templateStore;
    @Mock
    private UserAccessPolicy userAccessPolicy;

    private DataQualityTemplateService service;

    @BeforeEach
    void setUp() {
        service = new DataQualityTemplateService(templateStore, userAccessPolicy);
        UserContext.set(9L, false, "sess-1", "default");
        lenient().when(userAccessPolicy.requireRegisteredUserId()).thenReturn(9L);
        lenient().doNothing().when(userAccessPolicy).requireRegisteredUser();
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void saveCreatesTemplateWithGeneratedId() {
        when(templateStore.save(eq("default"), any())).thenAnswer(invocation -> invocation.getArgument(1));

        var dto = service.save(new SaveDataQualityTemplateRequest(
                null,
                "No negatives",
                "desc",
                "SELECT id FROM {table} WHERE amount < 0",
                "empty_result",
                "0",
                "",
                true,
                null
        ));

        assertTrue(dto.id().startsWith("dqshare"));
        assertEquals("No negatives", dto.name());
        assertTrue(dto.blocking());
        ArgumentCaptor<DataQualityTemplateEntity> captor = ArgumentCaptor.forClass(DataQualityTemplateEntity.class);
        verify(templateStore).save(eq("default"), captor.capture());
        assertEquals(9L, captor.getValue().getCreatedByUserId());
    }

    @Test
    void listSortsByUpdatedAtDescending() {
        DataQualityTemplateEntity older = entity("a", "Old", Instant.parse("2026-01-01T00:00:00Z"));
        DataQualityTemplateEntity newer = entity("b", "New", Instant.parse("2026-02-01T00:00:00Z"));
        when(templateStore.listByTenantId("default")).thenReturn(List.of(older, newer));

        var listed = service.list();
        assertEquals(2, listed.size());
        assertEquals("New", listed.get(0).name());
        assertEquals("Old", listed.get(1).name());
    }

    @Test
    void saveRejectsBlankName() {
        assertThrows(IllegalArgumentException.class, () -> service.save(
                new SaveDataQualityTemplateRequest(null, " ", null, "SELECT 1", "empty_result", null, null, false, null)));
    }

    @Test
    void deleteRequiresExisting() {
        when(templateStore.findById("default", "missing")).thenReturn(Optional.empty());
        assertThrows(IllegalArgumentException.class, () -> service.delete("missing"));
    }

    private static DataQualityTemplateEntity entity(String id, String name, Instant updatedAt) {
        DataQualityTemplateEntity entity = new DataQualityTemplateEntity();
        entity.setId(id);
        entity.setName(name);
        entity.setSql("SELECT 1");
        entity.setAssertion("empty_result");
        entity.setUpdatedAt(updatedAt);
        entity.setCreatedAt(updatedAt);
        return entity;
    }
}
