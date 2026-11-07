package org.apache.datawise.desktop.cef;

import org.apache.datawise.desktop.DesktopPaths;
import org.cef.OS;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Locates Chromium Embedded Framework for JetBrains JCEF on macOS (JBR layout or app bundle).
 */
public final class MacCefFrameworkSupport {
    private MacCefFrameworkSupport() {
    }

    public static void applyIfMac() {
        if (!OS.isMacintosh()) {
            return;
        }
        Path javaHome = Paths.get(System.getProperty("java.home", ""));
        Path frameworksBesideJre = javaHome.resolve("../Frameworks").normalize();
        if (Files.isDirectory(frameworksBesideJre.resolve("Chromium Embedded Framework.framework"))) {
            return;
        }
        Path base = resolveAppFrameworksBase();
        Path cef = base.resolve("Frameworks/Chromium Embedded Framework.framework");
        Path helper = base.resolve("Frameworks/jcef Helper.app");
        if (Files.isDirectory(cef)) {
            System.setProperty("ALT_CEF_FRAMEWORK_DIR", cef.toAbsolutePath().toString());
            System.out.println("[datawise-desktop] ALT_CEF_FRAMEWORK_DIR=" + cef);
        }
        if (Files.isDirectory(helper)) {
            System.setProperty("ALT_CEF_HELPER_APP_DIR", helper.toAbsolutePath().toString());
            System.out.println("[datawise-desktop] ALT_CEF_HELPER_APP_DIR=" + helper);
        }
    }

    private static Path resolveAppFrameworksBase() {
        Path install = DesktopPaths.installRoot();
        if (Files.isDirectory(install.resolve("Frameworks/Chromium Embedded Framework.framework"))) {
            return install;
        }
        // jpackage mac: Contents/app/*.jar → Contents has Frameworks
        Path contents = install.resolve("Contents");
        if (Files.isDirectory(contents.resolve("Frameworks/Chromium Embedded Framework.framework"))) {
            return contents;
        }
        if (Files.isDirectory(install.resolve("app"))) {
            Path parent = install;
            if (Files.isDirectory(parent.resolve("Frameworks/Chromium Embedded Framework.framework"))) {
                return parent;
            }
        }
        return install;
    }
}
