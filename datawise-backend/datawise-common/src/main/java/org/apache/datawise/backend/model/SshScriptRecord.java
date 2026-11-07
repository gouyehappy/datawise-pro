package org.apache.datawise.backend.model;

import java.util.ArrayList;
import java.util.List;

/**
 * Per-user SSH connection script / quick-command note.
 * <p>
 * Preferred payload is {@link #commands}. {@code contentHtml} is a legacy field (plain DSL text
 * or older HTML-wrapped values) kept for migration and optional editor round-trip.
 */
public class SshScriptRecord {

    private String id;
    private String title;
    /** @deprecated Prefer {@link #commands}; may still hold plain DSL text for legacy records. */
    private String contentHtml;
    private List<SshCommandItem> commands = new ArrayList<>();
    private long updatedAt;

    public SshScriptRecord() {
    }

    public SshScriptRecord(String id, String title, String contentHtml, long updatedAt) {
        this.id = id;
        this.title = title;
        this.contentHtml = contentHtml;
        this.updatedAt = updatedAt;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getContentHtml() {
        return contentHtml;
    }

    public void setContentHtml(String contentHtml) {
        this.contentHtml = contentHtml;
    }

    public List<SshCommandItem> getCommands() {
        return commands;
    }

    public void setCommands(List<SshCommandItem> commands) {
        this.commands = commands != null ? commands : new ArrayList<>();
    }

    public long getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(long updatedAt) {
        this.updatedAt = updatedAt;
    }
}
