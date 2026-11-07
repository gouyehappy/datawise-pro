package org.apache.datawise.desktop.ui;

import org.apache.datawise.desktop.DesktopAppIcons;
import org.apache.datawise.desktop.backend.BackendProcessService;

import javax.swing.JPanel;
import javax.swing.Timer;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.Image;
import java.awt.RenderingHints;
import java.awt.geom.Ellipse2D;
import java.util.Locale;

/** Icon + expanding ripple rings while {@link DesktopBootCover} keeps CEF off-screen. */
final class DesktopBootSplash extends JPanel {
    private static final int ICON_SIZE = 128;
    private static final float RING_START = ICON_SIZE * 0.58f;
    private static final float RING_TRAVEL = 96f;
    private static final int RING_COUNT = 3;
    private static final float STROKE = 2.2f;

    private final Image icon;
    private Color chrome;
    private Color primary;
    private float phase;
    private final Timer animator;
    private boolean failed;
    private String failureText = "";

    DesktopBootSplash(Color chrome) {
        this.icon = DesktopAppIcons.appIcon();
        setOpaque(true);
        applyColors(chrome);
        animator = new Timer(16, e -> {
            phase = (phase + 0.0085f) % 1f;
            repaint();
        });
        animator.start();
    }

    void applyColors(Color chromeBg) {
        chrome = chromeBg != null ? chromeBg : SplashTheme.awtChromeBackground();
        primary = SplashTheme.awtPrimary();
        setBackground(chrome);
        repaint();
    }

    void setStartupStatus(BackendProcessService.Phase phase, int progress) {
        failed = phase == BackendProcessService.Phase.failed;
        if (failed) {
            failureText = localizeFailed();
        }
        repaint();
    }

    void setStatusMessage(String message) {
        if (message == null || message.isBlank()) {
            return;
        }
        // Only surface explicit failure messages; normal phase chatter stays silent.
        if (failed || messageContainsFailure(message)) {
            failed = true;
            failureText = message.trim();
            repaint();
        }
    }

    private static boolean messageContainsFailure(String message) {
        String lower = message.toLowerCase(Locale.ROOT);
        return lower.contains("fail") || message.contains("失败");
    }

    private static String localizeFailed() {
        boolean zh = Locale.getDefault().getLanguage().toLowerCase(Locale.ROOT).startsWith("zh");
        return zh ? "启动失败" : "Startup failed";
    }

    void stop() {
        animator.stop();
    }

    @Override
    protected void paintComponent(Graphics g) {
        super.paintComponent(g);
        Graphics2D g2 = (Graphics2D) g.create();
        try {
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g2.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, RenderingHints.VALUE_STROKE_PURE);
            g2.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g2.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);

            int w = getWidth();
            int h = getHeight();
            g2.setColor(chrome);
            g2.fillRect(0, 0, w, h);

            int cx = w / 2;
            int cy = h / 2 - 12;
            for (int i = 0; i < RING_COUNT; i++) {
                paintRing(g2, cx, cy, (phase + i / (float) RING_COUNT) % 1f);
            }
            if (icon != null) {
                g2.drawImage(icon, cx - ICON_SIZE / 2, cy - ICON_SIZE / 2, ICON_SIZE, ICON_SIZE, null);
            }
            if (failed && failureText != null && !failureText.isBlank()) {
                g2.setFont(getFont().deriveFont(Font.PLAIN, 13f));
                FontMetrics fm = g2.getFontMetrics();
                int textY = cy + ICON_SIZE / 2 + 36;
                g2.setColor(new Color(primary.getRed(), primary.getGreen(), primary.getBlue(), 200));
                g2.drawString(failureText, Math.max(16, cx - fm.stringWidth(failureText) / 2), textY);
            }
        } finally {
            g2.dispose();
        }
    }

    private void paintRing(Graphics2D g2, int cx, int cy, float t) {
        float ease = 1f - (1f - t) * (1f - t);
        float radius = RING_START + RING_TRAVEL * ease;
        float alpha = (1f - t) * 0.55f;
        if (alpha <= 0.01f) {
            return;
        }
        g2.setColor(new Color(primary.getRed(), primary.getGreen(), primary.getBlue(),
                Math.round(alpha * 255f)));
        g2.setStroke(new BasicStroke(STROKE, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        g2.draw(new Ellipse2D.Float(cx - radius, cy - radius, radius * 2f, radius * 2f));
    }
}
