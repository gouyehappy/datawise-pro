package org.apache.datawise.backend.model;

/**
 * One structured quick-command entry inside an {@link SshScriptRecord}.
 */
public class SshCommandItem {

    private String title;
    private String command;
    /** {@code run} or {@code paste} */
    private String mode;
    private String description;

    public SshCommandItem() {
    }

    public SshCommandItem(String title, String command, String mode, String description) {
        this.title = title;
        this.command = command;
        this.mode = mode;
        this.description = description;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getCommand() {
        return command;
    }

    public void setCommand(String command) {
        this.command = command;
    }

    public String getMode() {
        return mode;
    }

    public void setMode(String mode) {
        this.mode = mode;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }
}
