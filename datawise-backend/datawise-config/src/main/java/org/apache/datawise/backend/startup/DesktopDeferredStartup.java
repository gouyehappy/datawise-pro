package org.apache.datawise.backend.startup;

/**
 * Helpers for desktop cold-start: run non-critical {@code ApplicationRunner} work
 * off the Spring startup thread so health/session are not CPU-starved.
 *
 * <p>Enabled when {@code datawise.gui=true} or active profiles contain {@code desktop},
 * unless {@code datawise.startup.defer-noncritical=false}.
 */
public final class DesktopDeferredStartup {
    private DesktopDeferredStartup() {
    }

    public static boolean shouldDefer() {
        if ("false".equalsIgnoreCase(System.getProperty("datawise.startup.defer-noncritical", ""))) {
            return false;
        }
        String envOff = System.getenv("DATAWISE_STARTUP_DEFER_NONCRITICAL");
        if (envOff != null && ("0".equals(envOff) || "false".equalsIgnoreCase(envOff))) {
            return false;
        }
        if (Boolean.parseBoolean(System.getProperty("datawise.gui", "false"))) {
            return true;
        }
        String profiles = System.getProperty("spring.profiles.active", "");
        for (String p : profiles.split(",")) {
            if ("desktop".equalsIgnoreCase(p.trim())) {
                return true;
            }
        }
        String springEnv = System.getenv("SPRING_PROFILES_ACTIVE");
        if (springEnv != null) {
            for (String p : springEnv.split(",")) {
                if ("desktop".equalsIgnoreCase(p.trim())) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Run {@code task} on a daemon thread when {@link #shouldDefer()}; otherwise run inline.
     */
    public static void runMaybeAsync(String name, Runnable task) {
        if (!shouldDefer()) {
            task.run();
            return;
        }
        Thread t = new Thread(task, "datawise-startup-" + name);
        t.setDaemon(true);
        t.start();
    }
}
