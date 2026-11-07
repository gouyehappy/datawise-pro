package org.apache.datawise.desktop.ui;

import org.cef.misc.EventFlags;
import org.junit.jupiter.api.Test;

import java.awt.event.KeyEvent;

import static org.junit.jupiter.api.Assertions.assertEquals;

class DesktopBrowserZoomTest {
    @Test
    void detectsZoomShortcuts() {
        assertEquals(DesktopBrowserZoom.IN, DesktopBrowserZoom.actionFromKey(
                KeyEvent.VK_EQUALS, EventFlags.EVENTFLAG_CONTROL_DOWN));
        assertEquals(DesktopBrowserZoom.OUT, DesktopBrowserZoom.actionFromKey(
                KeyEvent.VK_MINUS, EventFlags.EVENTFLAG_CONTROL_DOWN));
        assertEquals(DesktopBrowserZoom.RESET, DesktopBrowserZoom.actionFromKey(
                KeyEvent.VK_0, EventFlags.EVENTFLAG_CONTROL_DOWN));
        assertEquals(DesktopBrowserZoom.NONE, DesktopBrowserZoom.actionFromKey(
                KeyEvent.VK_I, EventFlags.EVENTFLAG_CONTROL_DOWN | EventFlags.EVENTFLAG_SHIFT_DOWN));
    }
}
