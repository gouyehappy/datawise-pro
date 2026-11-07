package org.apache.datawise.backend.server.pack;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Stream;

/**
 * Child ClassLoader for pack backend jars under config/packs/&lt;packId&gt;/backend/.
 * Does not replace the Spring application ClassLoader — call sites resolve types via
 * {@link #loadClass(String)} after {@link #refresh(Path)}.
 */
@Component
public class PackModuleClassLoader {

    private static final Logger log = LoggerFactory.getLogger(PackModuleClassLoader.class);

    private final AtomicReference<URLClassLoader> loader = new AtomicReference<>();

    /**
     * Rebuilds the child loader from all pack backend jars under {@code packsRoot}.
     */
    public synchronized void refresh(Path packsRoot) {
        URLClassLoader previous = loader.getAndSet(null);
        closeQuietly(previous);
        if (packsRoot == null || !Files.isDirectory(packsRoot)) {
            return;
        }
        List<URL> urls = new ArrayList<>();
        try (Stream<Path> packs = Files.list(packsRoot)) {
            packs.filter(Files::isDirectory).forEach(packDir -> {
                Path backend = packDir.resolve("backend");
                if (!Files.isDirectory(backend)) {
                    return;
                }
                try (Stream<Path> jars = Files.list(backend)) {
                    jars.filter(p -> {
                        String n = p.getFileName().toString().toLowerCase();
                        return Files.isRegularFile(p) && n.endsWith(".jar");
                    }).forEach(jar -> {
                        try {
                            urls.add(jar.toUri().toURL());
                        } catch (IOException ex) {
                            log.warn("Skip pack jar {}: {}", jar, ex.getMessage());
                        }
                    });
                } catch (IOException ex) {
                    log.warn("Skip pack backend {}: {}", backend, ex.getMessage());
                }
            });
        } catch (IOException ex) {
            log.warn("Failed to scan pack modules under {}: {}", packsRoot, ex.getMessage());
            return;
        }
        if (urls.isEmpty()) {
            return;
        }
        URLClassLoader child = new URLClassLoader(
                urls.toArray(URL[]::new),
                PackModuleClassLoader.class.getClassLoader()
        );
        loader.set(child);
        log.info("Pack module ClassLoader ready jars={}", urls.size());
    }

    /** Current child loader, or {@code null} when no pack jars are loaded. */
    public URLClassLoader currentLoader() {
        return loader.get();
    }

    public Class<?> loadClass(String name) throws ClassNotFoundException {
        URLClassLoader current = loader.get();
        if (current == null) {
            throw new ClassNotFoundException("No pack modules loaded: " + name);
        }
        return current.loadClass(name);
    }

    public boolean hasModules() {
        return loader.get() != null;
    }

    private static void closeQuietly(URLClassLoader cl) {
        if (cl == null) {
            return;
        }
        try {
            cl.close();
        } catch (IOException ignored) {
            // ignore
        }
    }
}
