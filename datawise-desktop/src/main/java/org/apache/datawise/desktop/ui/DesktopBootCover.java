package org.apache.datawise.desktop.ui;

import org.apache.datawise.desktop.backend.BackendProcessService;

import javax.swing.JComponent;
import javax.swing.JPanel;
import java.awt.BorderLayout;
import java.awt.CardLayout;
import java.awt.Color;

/**
 * Keeps CEF off-screen until Shell paints.
 *
 * <p>Windows JCEF uses a heavyweight HWND that paints above lightweight Swing
 * overlays, so CardLayout is required — a cover panel on top of CEF cannot hide
 * the white flash.
 */
public final class DesktopBootCover {
    private static final String CARD_COVER = "cover";
    private static final String CARD_CEF = "cef";

    private final CardLayout cards = new CardLayout();
    private final JPanel root = new JPanel(cards);
    private final DesktopBootSplash cover;
    private boolean dismissed;

    private DesktopBootCover(Color chrome) {
        cover = new DesktopBootSplash(chrome);
        root.setOpaque(true);
        root.setBackground(chrome);
    }

    public static DesktopBootCover install(JPanel host, JComponent cefUi) {
        Color chrome = FramelessResizeSupport.bootBackground();
        DesktopBootCover boot = new DesktopBootCover(chrome);
        boot.root.add(boot.cover, CARD_COVER);
        boot.root.add(cefUi, CARD_CEF);
        boot.cards.show(boot.root, CARD_COVER);
        host.setLayout(new BorderLayout());
        host.setOpaque(true);
        host.setBackground(chrome);
        host.add(boot.root, BorderLayout.CENTER);
        return boot;
    }

    public void refreshColor() {
        Color chrome = FramelessResizeSupport.bootBackground();
        cover.applyColors(chrome);
        root.setBackground(chrome);
    }

    /** Update splash stage label (Runtime → API → UI). */
    public void setStartupStatus(BackendProcessService.Phase phase, int progress) {
        if (dismissed) {
            return;
        }
        cover.setStartupStatus(phase, progress);
    }

    public void setStatusMessage(String message) {
        if (dismissed) {
            return;
        }
        cover.setStatusMessage(message);
    }

    public void dismiss() {
        if (dismissed) {
            return;
        }
        dismissed = true;
        cover.stop();
        refreshColor();
        cards.show(root, CARD_CEF);
        root.revalidate();
        root.repaint();
    }
}
