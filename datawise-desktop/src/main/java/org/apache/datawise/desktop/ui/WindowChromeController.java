package org.apache.datawise.desktop.ui;

import com.google.gson.JsonObject;

import javax.swing.JFrame;
import javax.swing.SwingUtilities;
import javax.swing.Timer;
import java.awt.Frame;
import java.awt.GraphicsConfiguration;
import java.awt.GraphicsEnvironment;
import java.awt.Insets;
import java.awt.MouseInfo;
import java.awt.Point;
import java.awt.Rectangle;
import java.awt.Toolkit;
import java.awt.event.WindowEvent;
import java.util.function.Consumer;

/**
 * Frameless window chrome: non-blocking ops (avoid CEF↔EDT deadlock) and
 * maximize to the monitor work area so the Windows taskbar stays visible.
 */
public final class WindowChromeController {
    private final JFrame frame;
    private final Consumer<Boolean> maximizeListener;
    private volatile boolean maximizedCache;
    private volatile boolean dragging;
    private volatile int dragOffsetX;
    private volatile int dragOffsetY;
    private Timer dragTimer;
    private Rectangle restoreBounds;

    public WindowChromeController(JFrame frame, Consumer<Boolean> maximizeListener) {
        this.frame = frame;
        this.maximizeListener = maximizeListener;
        this.maximizedCache = false;
    }

    public boolean isMaximized() {
        return maximizedCache;
    }

    /** Restore-from-disk helper: mark maximized without emitting UI events. */
    public void markMaximized(boolean maximized, Rectangle normalBounds) {
        maximizedCache = maximized;
        if (normalBounds != null) {
            restoreBounds = new Rectangle(normalBounds);
        }
    }

    /** Snapshot used by window:getState and window-state.json. */
    public JsonObject snapshotState() {
        JsonObject state = new JsonObject();
        Rectangle bounds = maximizedCache && restoreBounds != null
                ? restoreBounds
                : frame.getBounds();
        state.addProperty("width", bounds.width);
        state.addProperty("height", bounds.height);
        state.addProperty("x", bounds.x);
        state.addProperty("y", bounds.y);
        state.addProperty("maximized", maximizedCache);
        return state;
    }

    /** Apply renderer/prefs window state (window:setState). */
    public void applyState(JsonObject state) {
        SwingUtilities.invokeLater(() -> {
            int width = Math.max(320, intOr(state, "width", frame.getWidth()));
            int height = Math.max(240, intOr(state, "height", frame.getHeight()));
            Integer x = state.has("x") && !state.get("x").isJsonNull() ? state.get("x").getAsInt() : null;
            Integer y = state.has("y") && !state.get("y").isJsonNull() ? state.get("y").getAsInt() : null;
            boolean maximized = state.has("maximized") && !state.get("maximized").isJsonNull()
                    && state.get("maximized").getAsBoolean();
            if (maximized) {
                restoreBounds = new Rectangle(
                        x != null ? x : frame.getX(),
                        y != null ? y : frame.getY(),
                        width,
                        height);
                Rectangle work = workArea(frame);
                frame.setBounds(work);
                maximizedCache = true;
            } else {
                maximizedCache = false;
                frame.setExtendedState(Frame.NORMAL);
                if (x != null && y != null) {
                    frame.setBounds(x, y, width, height);
                } else {
                    frame.setSize(width, height);
                }
                restoreBounds = frame.getBounds();
            }
            if (maximizeListener != null) {
                maximizeListener.accept(maximizedCache);
            }
        });
    }

    private static int intOr(JsonObject state, String key, int fallback) {
        if (state == null || !state.has(key) || state.get(key).isJsonNull()) {
            return fallback;
        }
        try {
            return state.get(key).getAsInt();
        } catch (Exception e) {
            return fallback;
        }
    }

    /** Fire-and-forget on EDT — never block the CEF query thread. */
    public void minimize() {
        SwingUtilities.invokeLater(() -> frame.setState(Frame.ICONIFIED));
    }

    public void close() {
        SwingUtilities.invokeLater(() ->
                frame.dispatchEvent(new WindowEvent(frame, WindowEvent.WINDOW_CLOSING)));
    }

    public void toggleMaximize() {
        SwingUtilities.invokeLater(() -> {
            // Undecorated: do not use MAXIMIZED_BOTH — Windows expands over the taskbar.
            if (maximizedCache) {
                if (restoreBounds != null) {
                    frame.setBounds(restoreBounds);
                } else {
                    frame.setSize(1440, 900);
                    frame.setLocationRelativeTo(null);
                }
                frame.setExtendedState(Frame.NORMAL);
                maximizedCache = false;
            } else {
                restoreBounds = frame.getBounds();
                Rectangle work = workArea(frame);
                frame.setMaximizedBounds(work);
                frame.setBounds(work);
                maximizedCache = true;
            }
            if (maximizeListener != null) {
                maximizeListener.accept(maximizedCache);
            }
        });
    }

    public boolean startDrag(int screenX, int screenY) {
        if (maximizedCache) {
            return false;
        }
        Runnable start = () -> {
            Point loc = frame.getLocationOnScreen();
            dragOffsetX = screenX - loc.x;
            dragOffsetY = screenY - loc.y;
            dragging = true;
            if (dragTimer != null) {
                dragTimer.stop();
            }
            // Poll mouse on EDT — no per-pixel cefQuery (that made the title bar feel frozen).
            dragTimer = new Timer(8, e -> {
                if (!dragging) {
                    stopDragTimer();
                    return;
                }
                Point mouse = MouseInfo.getPointerInfo().getLocation();
                frame.setLocation(mouse.x - dragOffsetX, mouse.y - dragOffsetY);
            });
            dragTimer.setRepeats(true);
            dragTimer.start();
        };
        if (SwingUtilities.isEventDispatchThread()) {
            start.run();
        } else {
            SwingUtilities.invokeLater(start);
        }
        return true;
    }

    public void endDrag() {
        dragging = false;
        SwingUtilities.invokeLater(this::stopDragTimer);
    }

    private void stopDragTimer() {
        if (dragTimer != null) {
            dragTimer.stop();
            dragTimer = null;
        }
    }

    public static Rectangle workArea(JFrame frame) {
        GraphicsConfiguration gc = frame.getGraphicsConfiguration();
        if (gc == null) {
            gc = GraphicsEnvironment.getLocalGraphicsEnvironment()
                    .getDefaultScreenDevice()
                    .getDefaultConfiguration();
        }
        Rectangle screen = gc.getBounds();
        Insets insets = Toolkit.getDefaultToolkit().getScreenInsets(gc);
        return new Rectangle(
                screen.x + insets.left,
                screen.y + insets.top,
                screen.width - insets.left - insets.right,
                screen.height - insets.top - insets.bottom
        );
    }
}
