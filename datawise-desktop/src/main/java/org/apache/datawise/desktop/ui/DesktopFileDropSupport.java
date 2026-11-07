package org.apache.datawise.desktop.ui;

import java.awt.Component;
import java.awt.datatransfer.DataFlavor;
import java.awt.datatransfer.Transferable;
import java.awt.dnd.DnDConstants;
import java.awt.dnd.DropTarget;
import java.awt.dnd.DropTargetAdapter;
import java.awt.dnd.DropTargetDropEvent;
import java.io.File;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;

/**
 * Accept OS file drops on a component and forward paths (best-effort over CEF).
 * Prefer {@code .sql}/{@code .ddl}; other files are still forwarded for the UI to reject.
 */
public final class DesktopFileDropSupport {
    private DesktopFileDropSupport() {
    }

    public static void install(Component component, Consumer<Path> onPath) {
        if (component == null || onPath == null) {
            return;
        }
        new DropTarget(component, DnDConstants.ACTION_COPY, new DropTargetAdapter() {
            @Override
            public void drop(DropTargetDropEvent dtde) {
                try {
                    Transferable transferable = dtde.getTransferable();
                    if (!transferable.isDataFlavorSupported(DataFlavor.javaFileListFlavor)) {
                        dtde.rejectDrop();
                        return;
                    }
                    dtde.acceptDrop(DnDConstants.ACTION_COPY);
                    @SuppressWarnings("unchecked")
                    List<File> files = (List<File>) transferable.getTransferData(DataFlavor.javaFileListFlavor);
                    boolean accepted = false;
                    if (files != null) {
                        for (File file : files) {
                            if (file == null) {
                                continue;
                            }
                            Path path = file.toPath().toAbsolutePath().normalize();
                            if (isForwardedDrop(path)) {
                                onPath.accept(path);
                                accepted = true;
                            }
                        }
                    }
                    dtde.dropComplete(accepted);
                } catch (Exception e) {
                    try {
                        dtde.dropComplete(false);
                    } catch (Exception ignored) {
                    }
                }
            }
        }, true);
    }

    private static boolean isForwardedDrop(Path path) {
        return isLikelyTextScript(path) || isCommunityPackage(path);
    }

    private static boolean isCommunityPackage(Path path) {
        String name = path.getFileName() == null ? "" : path.getFileName().toString().toLowerCase(Locale.ROOT);
        return name.endsWith(".dwp");
    }

    private static boolean isLikelyTextScript(Path path) {
        String name = path.getFileName() == null ? "" : path.getFileName().toString().toLowerCase(Locale.ROOT);
        return name.endsWith(".sql")
                || name.endsWith(".ddl")
                || name.endsWith(".txt")
                || name.endsWith(".csv")
                || name.endsWith(".json")
                || name.endsWith(".md")
                || name.endsWith(".markdown")
                || name.endsWith(".log")
                || name.endsWith(".yaml")
                || name.endsWith(".yml")
                || name.endsWith(".xml");
    }
}
