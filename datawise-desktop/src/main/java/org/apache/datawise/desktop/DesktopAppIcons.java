package org.apache.datawise.desktop;

import javax.imageio.ImageIO;
import java.awt.Graphics2D;
import java.awt.Image;
import java.awt.RenderingHints;
import java.awt.Taskbar;
import java.awt.image.BufferedImage;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Resolves DataWise app / tray icons ({@code icons/icon.png}, {@code icons/tray-icon.png}).
 */
public final class DesktopAppIcons {
    private static final String RESOURCE_ICON = "/icons/icon.png";
    private static final String RESOURCE_TRAY = "/icons/tray-icon.png";
    private static volatile Image cachedApp;
    private static volatile Image cachedTray;
    private static volatile List<Image> cachedAppSizes;

    private DesktopAppIcons() {
    }

    public static Image appIcon() {
        Image cached = cachedApp;
        if (cached != null) {
            return cached;
        }
        BufferedImage loaded = loadPng("icon.png", RESOURCE_ICON);
        if (loaded == null) {
            loaded = placeholder();
        }
        cachedApp = loaded;
        return loaded;
    }

    public static List<Image> appIconSizes() {
        List<Image> cached = cachedAppSizes;
        if (cached != null) {
            return cached;
        }
        BufferedImage source = loadPng("icon.png", RESOURCE_ICON);
        if (source == null) {
            source = placeholder();
        }
        int[] sizes = {16, 24, 32, 48, 64, 128, 256};
        List<Image> list = new ArrayList<>(sizes.length);
        for (int size : sizes) {
            list.add(scale(source, size, size));
        }
        cachedAppSizes = list;
        cachedApp = list.get(list.size() - 1);
        return list;
    }

    /** Tray / notification icon (prefers tray-icon.png, falls back to app icon). */
    public static Image trayIcon() {
        Image cached = cachedTray;
        if (cached != null) {
            return cached;
        }
        BufferedImage loaded = loadPng("tray-icon.png", RESOURCE_TRAY);
        if (loaded == null) {
            loaded = loadPng("icon.png", RESOURCE_ICON);
        }
        if (loaded == null) {
            loaded = placeholder();
        }
        // Windows tray looks best around 16–32 px
        cachedTray = scale(loaded, 32, 32);
        return cachedTray;
    }

    /** Apply window + OS taskbar icons (safe to call on EDT). */
    public static void applyToWindow(java.awt.Window window) {
        if (window == null) {
            return;
        }
        List<Image> sizes = appIconSizes();
        window.setIconImages(sizes);
        try {
            if (Taskbar.isTaskbarSupported()) {
                Taskbar taskbar = Taskbar.getTaskbar();
                if (taskbar.isSupported(Taskbar.Feature.ICON_IMAGE)) {
                    taskbar.setIconImage(appIcon());
                }
            }
        } catch (Exception ignored) {
            // Some hosts reject taskbar icon changes; window icons still apply.
        }
    }

    private static BufferedImage loadPng(String fileName, String classpathResource) {
        for (Path candidate : candidatePaths(fileName)) {
            try {
                if (Files.isRegularFile(candidate)) {
                    BufferedImage img = ImageIO.read(candidate.toFile());
                    if (img != null) {
                        return img;
                    }
                }
            } catch (Exception ignored) {
            }
        }
        try (InputStream in = DesktopAppIcons.class.getResourceAsStream(classpathResource)) {
            if (in != null) {
                return ImageIO.read(in);
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private static List<Path> candidatePaths(String fileName) {
        List<Path> paths = new ArrayList<>();
        Path install = DesktopPaths.installRoot();
        paths.add(install.resolve("icons").resolve(fileName));
        paths.add(install.resolve("resources").resolve("icons").resolve(fileName));
        paths.add(install.resolve("build").resolve(fileName));
        paths.add(install.resolve("datawise-frontend").resolve("build").resolve(fileName));
        String cwd = System.getProperty("user.dir");
        if (cwd != null) {
            paths.add(Path.of(cwd, "icons", fileName));
            paths.add(Path.of(cwd, "build", fileName));
            paths.add(Path.of(cwd, "..", "datawise-frontend", "build", fileName));
        }
        return paths;
    }

    private static BufferedImage scale(BufferedImage source, int width, int height) {
        BufferedImage out = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = out.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.drawImage(source, 0, 0, width, height, null);
        } finally {
            g.dispose();
        }
        return out;
    }

    private static BufferedImage placeholder() {
        BufferedImage img = new BufferedImage(32, 32, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        try {
            g.setColor(new java.awt.Color(0x52, 0x48, 0xE8));
            g.fillRoundRect(2, 2, 28, 28, 8, 8);
            g.setColor(java.awt.Color.WHITE);
            g.setFont(g.getFont().deriveFont(java.awt.Font.BOLD, 18f));
            g.drawString("D", 9, 23);
        } finally {
            g.dispose();
        }
        return img;
    }
}
