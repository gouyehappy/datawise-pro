package org.apache.datawise.desktop.deeplink;

import org.apache.datawise.desktop.DesktopPaths;

import java.io.RandomAccessFile;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;

public final class SingleInstanceGuard implements AutoCloseable {
    /** 二次启动时唤醒已有实例（无 deep link 时也写 inbox） */
    public static final String ACTIVATE_TOKEN = "__datawise_activate__";

    private RandomAccessFile raf;
    private FileChannel channel;
    private FileLock lock;
    private final List<String> pendingUrls = new CopyOnWriteArrayList<>();
    private Consumer<List<String>> secondInstanceHandler;
    private volatile Thread inboxThread;

    public boolean tryAcquire() {
        try {
            Files.createDirectories(DesktopPaths.userDataDir());
            raf = new RandomAccessFile(DesktopPaths.singleInstanceLockFile().toFile(), "rw");
            channel = raf.getChannel();
            lock = channel.tryLock();
            return lock != null;
        } catch (Exception e) {
            return false;
        }
    }

    public void setSecondInstanceHandler(Consumer<List<String>> handler) {
        this.secondInstanceHandler = handler;
    }

    public void enqueueDeepLink(String url) {
        if (url != null && !url.isBlank()) {
            pendingUrls.add(url.trim());
        }
    }

    public List<String> drainPending() {
        List<String> copy = new ArrayList<>(pendingUrls);
        pendingUrls.clear();
        return copy;
    }

    /** 已有实例在跑：写入 inbox 唤醒主窗口（并附带 deep link）。二次启动进程随后 exit。 */
    public static void notifyRunningInstance(String[] args) {
        try {
            Files.createDirectories(DesktopPaths.userDataDir());
            List<String> messages = new ArrayList<>();
            messages.add(ACTIVATE_TOKEN);
            if (args != null) {
                for (String arg : args) {
                    if (arg != null && arg.startsWith("datawise://")) {
                        messages.add(arg.trim());
                    }
                }
            }
            PathInbox.write(messages);
        } catch (Exception ignored) {
        }
    }

    public void startInboxPoller() {
        if (inboxThread != null) {
            return;
        }
        Thread t = new Thread(() -> {
            while (!Thread.currentThread().isInterrupted()) {
                try {
                    List<String> urls = PathInbox.drain();
                    if (!urls.isEmpty() && secondInstanceHandler != null) {
                        secondInstanceHandler.accept(urls);
                    }
                    Thread.sleep(500);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return;
                } catch (Exception ignored) {
                }
            }
        }, "datawise-single-instance-inbox");
        t.setDaemon(true);
        inboxThread = t;
        t.start();
    }

    @Override
    public void close() {
        if (inboxThread != null) {
            inboxThread.interrupt();
            inboxThread = null;
        }
        try {
            if (lock != null) {
                lock.release();
                lock = null;
            }
        } catch (Exception ignored) {
        }
        try {
            if (channel != null) {
                channel.close();
                channel = null;
            }
        } catch (Exception ignored) {
        }
        try {
            if (raf != null) {
                raf.close();
                raf = null;
            }
        } catch (Exception ignored) {
        }
        // Best-effort: drop the lock file so a delayed relaunch does not race a stale handle.
        try {
            Files.deleteIfExists(DesktopPaths.singleInstanceLockFile());
        } catch (Exception ignored) {
        }
    }

    static final class PathInbox {
        private static final java.nio.file.Path FILE = DesktopPaths.userDataDir().resolve("deep-link-inbox.txt");

        static synchronized void write(List<String> urls) throws Exception {
            StringBuilder sb = new StringBuilder();
            for (String url : urls) {
                sb.append(url).append('\n');
            }
            Files.writeString(FILE, sb.toString(), java.nio.charset.StandardCharsets.UTF_8,
                    java.nio.file.StandardOpenOption.CREATE, java.nio.file.StandardOpenOption.APPEND);
        }

        static synchronized List<String> drain() throws Exception {
            if (!Files.isRegularFile(FILE)) {
                return List.of();
            }
            List<String> lines = Files.readAllLines(FILE, java.nio.charset.StandardCharsets.UTF_8);
            Files.deleteIfExists(FILE);
            return lines.stream().map(String::trim).filter(s -> !s.isEmpty()).toList();
        }
    }
}
