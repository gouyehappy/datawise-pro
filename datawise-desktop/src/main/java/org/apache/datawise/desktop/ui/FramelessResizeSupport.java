package org.apache.datawise.desktop.ui;

import org.cef.browser.CefBrowser;

import javax.swing.JComponent;
import javax.swing.JFrame;
import javax.swing.JPanel;
import javax.swing.SwingUtilities;
import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Cursor;
import java.awt.Point;
import java.awt.Rectangle;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.awt.event.MouseMotionAdapter;

/**
 * Installs CEF full-bleed in {@link BorderLayout#CENTER} and attaches an invisible
 * glass-pane edge hit-target for frameless resize (no layout gutter / white rim).
 */
public final class FramelessResizeSupport {
    private static final int BORDER = 5;
    private static final int N = 1;
    private static final int S = 2;
    private static final int W = 4;
    private static final int E = 8;

    private FramelessResizeSupport() {
    }

    public static Color bootBackground() {
        return SplashTheme.awtChromeBackground();
    }

    /** Installs CEF under a boot cover card; returns the cover for dismiss/refresh. */
    public static DesktopBootCover install(JFrame frame, JComponent cefUi, CefBrowser browser) {
        JPanel host = new JPanel(new BorderLayout());
        host.setOpaque(true);
        host.setBackground(bootBackground());
        DesktopBootCover cover = DesktopBootCover.install(host, cefUi);
        frame.setContentPane(host);
        installEdgeResizeGlass(frame);
        return cover;
    }

    public static void notifyBrowserResized(CefBrowser browser, JFrame frame) {
        if (browser == null) {
            return;
        }
        JComponent ui = (JComponent) browser.getUIComponent();
        ui.invalidate();
        ui.revalidate();
        ui.repaint();
        if (frame != null && frame.getContentPane() != null) {
            frame.getContentPane().revalidate();
            frame.getContentPane().repaint();
        }
    }

    private static void installEdgeResizeGlass(JFrame frame) {
        JComponent glass = new JComponent() {
            @Override
            public boolean contains(int x, int y) {
                int w = getWidth();
                int h = getHeight();
                if (w <= 0 || h <= 0) {
                    return false;
                }
                return edgeAt(x, y, w, h) != 0;
            }
        };
        glass.setOpaque(false);

        final int[] activeEdge = {0};
        final Point[] dragStart = {null};
        final Rectangle[] startBounds = {null};

        glass.addMouseListener(new MouseAdapter() {
            @Override
            public void mousePressed(MouseEvent e) {
                if (!SwingUtilities.isLeftMouseButton(e) || isWorkAreaFilled(frame)) {
                    return;
                }
                activeEdge[0] = edgeAt(e.getX(), e.getY(), glass.getWidth(), glass.getHeight());
                if (activeEdge[0] == 0) {
                    return;
                }
                dragStart[0] = e.getLocationOnScreen();
                startBounds[0] = frame.getBounds();
            }

            @Override
            public void mouseReleased(MouseEvent e) {
                dragStart[0] = null;
                startBounds[0] = null;
                activeEdge[0] = 0;
            }

            @Override
            public void mouseExited(MouseEvent e) {
                glass.setCursor(Cursor.getDefaultCursor());
            }
        });
        glass.addMouseMotionListener(new MouseMotionAdapter() {
            @Override
            public void mouseMoved(MouseEvent e) {
                if (isWorkAreaFilled(frame)) {
                    glass.setCursor(Cursor.getDefaultCursor());
                    return;
                }
                glass.setCursor(cursorFor(edgeAt(e.getX(), e.getY(), glass.getWidth(), glass.getHeight())));
            }

            @Override
            public void mouseDragged(MouseEvent e) {
                if (dragStart[0] == null || startBounds[0] == null || activeEdge[0] == 0) {
                    return;
                }
                Point now = e.getLocationOnScreen();
                int dx = now.x - dragStart[0].x;
                int dy = now.y - dragStart[0].y;
                Rectangle b = new Rectangle(startBounds[0]);
                int minW = Math.max(frame.getMinimumSize().width, 1100);
                int minH = Math.max(frame.getMinimumSize().height, 680);
                int edge = activeEdge[0];
                if ((edge & E) != 0) {
                    b.width = Math.max(minW, startBounds[0].width + dx);
                }
                if ((edge & S) != 0) {
                    b.height = Math.max(minH, startBounds[0].height + dy);
                }
                if ((edge & W) != 0) {
                    int newW = Math.max(minW, startBounds[0].width - dx);
                    b.x = startBounds[0].x + (startBounds[0].width - newW);
                    b.width = newW;
                }
                if ((edge & N) != 0) {
                    int newH = Math.max(minH, startBounds[0].height - dy);
                    b.y = startBounds[0].y + (startBounds[0].height - newH);
                    b.height = newH;
                }
                frame.setBounds(b);
            }
        });

        frame.setGlassPane(glass);
        glass.setVisible(true);
    }

    private static int edgeAt(int x, int y, int w, int h) {
        int edge = 0;
        if (y < BORDER) {
            edge |= N;
        }
        if (y >= h - BORDER) {
            edge |= S;
        }
        if (x < BORDER) {
            edge |= W;
        }
        if (x >= w - BORDER) {
            edge |= E;
        }
        return edge;
    }

    private static boolean isWorkAreaFilled(JFrame frame) {
        Rectangle work = WindowChromeController.workArea(frame);
        Rectangle b = frame.getBounds();
        return Math.abs(b.width - work.width) < 8 && Math.abs(b.height - work.height) < 8
                && Math.abs(b.x - work.x) < 8 && Math.abs(b.y - work.y) < 8;
    }

    private static Cursor cursorFor(int edge) {
        return switch (edge) {
            case N -> Cursor.getPredefinedCursor(Cursor.N_RESIZE_CURSOR);
            case S -> Cursor.getPredefinedCursor(Cursor.S_RESIZE_CURSOR);
            case W -> Cursor.getPredefinedCursor(Cursor.W_RESIZE_CURSOR);
            case E -> Cursor.getPredefinedCursor(Cursor.E_RESIZE_CURSOR);
            case N | W -> Cursor.getPredefinedCursor(Cursor.NW_RESIZE_CURSOR);
            case N | E -> Cursor.getPredefinedCursor(Cursor.NE_RESIZE_CURSOR);
            case S | W -> Cursor.getPredefinedCursor(Cursor.SW_RESIZE_CURSOR);
            case S | E -> Cursor.getPredefinedCursor(Cursor.SE_RESIZE_CURSOR);
            default -> Cursor.getDefaultCursor();
        };
    }
}
