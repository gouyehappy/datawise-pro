package org.apache.datawise.backend.platform.workbenchcontext;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WorkbenchContextStoreTest {

    private WorkbenchContextStore store;

    @BeforeEach
    void setUp() {
        store = new WorkbenchContextStore();
        store.clearForTests();
    }

    @Test
    void getMissingReturnsOfflineEmpty() {
        WorkbenchContextSnapshot snap = store.get(1L, "default");
        assertFalse(snap.online());
        assertEquals(WorkbenchContextSnapshot.SCHEMA_VERSION, snap.schemaVersion());
        assertTrue(snap.openTabs().isEmpty());
    }

    @Test
    void putThenGetReturnsOnlineFocus() {
        WorkbenchContextSnapshot incoming = new WorkbenchContextSnapshot(
                1,
                null,
                "web",
                true,
                new WorkbenchContextSnapshot.Focus(
                        "workspace", "c1", "Orders", "app", null, "mysql", "prod",
                        "table", "orders", null, null),
                new WorkbenchContextSnapshot.ActiveTab(
                        "tab-1", "console", "SQL", "c1", "app",
                        "select 1", false, 8),
                List.of(new WorkbenchContextSnapshot.OpenTab("tab-1", "console", "SQL", "c1", "app")),
                null,
                List.of(),
                null
        );
        store.put(7L, "acme", incoming);
        WorkbenchContextSnapshot snap = store.get(7L, "acme");
        assertTrue(snap.online());
        assertEquals("c1", snap.focus().connectionId());
        assertEquals("Orders", snap.focus().connectionName());
        assertEquals("select 1", snap.activeTab().bodyPreview());
        assertTrue(snap.privacy().secretsRedacted());
    }

    @Test
    void truncatesBodyPreviewToDefaultMax() {
        String longSql = "x".repeat(WorkbenchContextSnapshot.DEFAULT_BODY_PREVIEW_MAX_CHARS + 50);
        WorkbenchContextSnapshot incoming = new WorkbenchContextSnapshot(
                1, null, "desktop", true,
                new WorkbenchContextSnapshot.Focus(
                        "workspace", "c1", null, null, null, null, null, null, null, null, null),
                new WorkbenchContextSnapshot.ActiveTab(
                        "t", "console", "SQL", "c1", null, longSql, false, longSql.length()),
                List.of(), null, List.of(), null
        );
        store.put(1L, "default", incoming);
        WorkbenchContextSnapshot snap = store.get(1L, "default", true);
        assertEquals(WorkbenchContextSnapshot.DEFAULT_BODY_PREVIEW_MAX_CHARS, snap.activeTab().bodyPreview().length());
        assertTrue(snap.activeTab().bodyTruncated());
        assertEquals(longSql.length(), snap.activeTab().bodyLength());
    }

    @Test
    void omitBodyPreviewWhenRequested() {
        WorkbenchContextSnapshot incoming = new WorkbenchContextSnapshot(
                1, null, "web", true,
                new WorkbenchContextSnapshot.Focus(
                        "workspace", "c1", null, "db", null, null, null, null, null, null, null),
                new WorkbenchContextSnapshot.ActiveTab(
                        "t", "console", "SQL", "c1", "db", "select * from t", false, 15),
                List.of(), null, List.of(), null
        );
        store.put(2L, "default", incoming);
        WorkbenchContextSnapshot snap = store.get(2L, "default", false);
        assertNull(snap.activeTab().bodyPreview());
        assertEquals(15, snap.activeTab().bodyLength());
    }

    @Test
    void tenantsAreIsolated() {
        WorkbenchContextSnapshot a = new WorkbenchContextSnapshot(
                1, null, "web", true,
                new WorkbenchContextSnapshot.Focus(
                        "workspace", "a", null, null, null, null, null, null, null, null, null),
                null, List.of(), null, List.of(), null
        );
        store.put(1L, "t1", a);
        assertFalse(store.get(1L, "t2").online());
        assertEquals("a", store.get(1L, "t1").focus().connectionId());
    }
}
