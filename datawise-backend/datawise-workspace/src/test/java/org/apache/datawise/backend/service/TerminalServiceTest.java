package org.apache.datawise.backend.service;

import org.apache.datawise.backend.domain.TerminalStatusDto;
import org.apache.datawise.backend.terminal.TerminalPtySessionManager;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TerminalServiceTest {

    private final TerminalService service = new TerminalService(
            new TerminalPtySessionManager(),
            false,
            "/ws/terminal"
    );

    @Test
    void welcomeForWebMentionsDemoMode() {
        String message = service.welcome("web");
        assertTrue(message.contains("demo") || message.contains("演示"));
        assertTrue(message.contains("桌面"));
    }

    @Test
    void welcomeForDesktopWithoutPtyMentionsDemo() {
        String message = service.welcome("win32");
        assertTrue(message.contains("demo") || message.contains("演示"));
        assertTrue(message.contains("PTY") || message.contains("Shell") || message.contains("演示"));
    }

    @Test
    void welcomeForDesktopWithPtyMentionsSystemShell() {
        TerminalService enabled = new TerminalService(new TerminalPtySessionManager(), true, "/ws/terminal");
        String message = enabled.welcome("win32");
        assertTrue(message.contains("Shell") || message.contains("PTY"));
        assertTrue(!message.contains("demo") && !message.contains("演示"));
    }

    @Test
    void executeHelpReturnsCommands() {
        var result = service.execute("help", "~/datawise", "web");
        assertEquals("~/datawise", result.cwd());
        assertTrue(result.lines().stream().anyMatch(line -> line.get("text").contains("help")));
    }

    @Test
    void executeUnknownCommandReturnsError() {
        var result = service.execute("not-a-real-cmd", "~/datawise", "web");
        assertTrue(result.lines().stream().anyMatch(line -> line.get("type").equals("err")));
    }

    @Test
    void statusReflectsWebsocketToggle() {
        TerminalService enabled = new TerminalService(new TerminalPtySessionManager(), true, "/ws/terminal");
        TerminalStatusDto status = enabled.status();
        assertTrue(status.websocketEnabled());
        assertEquals("/ws/terminal", status.websocketPath());
    }
}
