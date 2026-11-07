package org.apache.datawise.backend.service.viewmodel;

import org.apache.datawise.backend.domain.SaveViewModelRequest;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.service.ViewModelAssembly;
import org.apache.datawise.backend.service.ViewModelService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ViewModelFileServiceTest {

    @TempDir
    Path tempDir;

    private ViewModelService viewModelService;

    @BeforeEach
    void setUp() {
        viewModelService = ViewModelAssembly.forTest(tempDir);
    }

    @Test
    void save_rejectsNonSelectSql() {
        SaveViewModelRequest request = new SaveViewModelRequest(
                "conn-1",
                null,
                "db1",
                "bad_model",
                "UPDATE users SET name = 'x'"
        );

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> viewModelService.save(request)
        );
        assertEquals("View model SQL must be a SELECT query", ex.getMessage());
    }

    @Test
    void save_persistsSelectSql() throws Exception {
        SaveViewModelRequest request = new SaveViewModelRequest(
                "conn-1",
                null,
                "db1",
                "sales_summary",
                "SELECT id, sum(amount) FROM orders GROUP BY id"
        );

        var result = viewModelService.save(request);
        assertEquals("sales_summary", result.name());
        assertEquals(false, result.draft());

        Path file = tempDir
                .resolve("conn-1")
                .resolve("db1")
                .resolve("view-models")
                .resolve("sales_summary.view.sql");
        assertTrue(Files.isRegularFile(file));
        assertTrue(Files.readString(file).contains("SELECT id"));
    }

    @Test
    void saveDraft_persistsWithoutSelectValidation() throws Exception {
        SaveViewModelRequest request = new SaveViewModelRequest(
                "conn-1",
                null,
                "db1",
                "model_01",
                "UPDATE users SET name = 'x'"
        );

        var result = viewModelService.saveDraft(request);
        assertEquals("model_01", result.name());
        assertTrue(result.draft());

        Path draft = tempDir
                .resolve("conn-1")
                .resolve("db1")
                .resolve("view-models")
                .resolve("model_01.view.sql.draft");
        assertTrue(Files.isRegularFile(draft));
    }

    @Test
    void listViewModelNodes_marksPublishedAndDraftStatus() throws Exception {
        viewModelService.save(new SaveViewModelRequest(
                "conn-1",
                null,
                "db1",
                "dv_test",
                "SELECT 1"
        ));
        viewModelService.saveDraft(new SaveViewModelRequest(
                "conn-1",
                null,
                "db1",
                "model_draft",
                "SELECT 2"
        ));

        var nodes = viewModelService.listViewModelNodes("conn-1", "db1");
        assertEquals(2, nodes.size());

        TreeNode published = nodes.stream()
                .filter(node -> "dv_test".equals(node.getLabel()))
                .findFirst()
                .orElseThrow();
        assertEquals(ViewModelCatalogService.META_PUBLISHED, published.getMeta());

        TreeNode draft = nodes.stream()
                .filter(node -> "model_draft".equals(node.getLabel()))
                .findFirst()
                .orElseThrow();
        assertEquals(ViewModelCatalogService.META_DRAFT, draft.getMeta());
    }
}
