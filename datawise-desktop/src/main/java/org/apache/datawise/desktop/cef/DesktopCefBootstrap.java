package org.apache.datawise.desktop.cef;

import com.jetbrains.cef.JCefAppConfig;
import org.cef.CefApp;
import org.cef.CefSettings;
import org.cef.callback.CefCommandLine;
import org.cef.handler.CefAppHandlerAdapter;

import javax.swing.SwingUtilities;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Starts JetBrains JCEF once per JVM (requires JBR with JCEF / {@code jbr_jcef} runtime).
 *
 * <p><b>Must not</b> be called on the AWT Event Dispatch Thread: {@code onContextInitialized}
 * is delivered on the EDT, so awaiting it while already on the EDT deadlocks.
 */
public final class DesktopCefBootstrap {
    private static final Object LOCK = new Object();
    private static volatile CefApp instance;

    private DesktopCefBootstrap() {
    }

    public static CefApp ensureStarted(String[] args) throws InterruptedException {
        CefApp existing = instance;
        if (existing != null) {
            return existing;
        }
        if (SwingUtilities.isEventDispatchThread()) {
            throw new IllegalStateException(
                    "DesktopCefBootstrap.ensureStarted must run off the EDT "
                            + "(waiting for onContextInitialized on the EDT deadlocks). "
                            + "Call it from main before SwingUtilities.invokeLater.");
        }
        synchronized (LOCK) {
            if (instance != null) {
                return instance;
            }
            System.setProperty("ide.browser.jcef.osr.enabled", "false");
            System.setProperty("sun.java2d.opengl", "true");
            MacCefFrameworkSupport.applyIfMac();

            JCefAppConfig config = JCefAppConfig.getInstance();
            CefSettings settings = config.getCefSettings();
            CefRuntimeConfig.applySettings(settings);
            String[] appArgs = CefRuntimeConfig.mergeAppArgs(config.getAppArgs());

            CountDownLatch ready = new CountDownLatch(1);
            AtomicReference<RuntimeException> failure = new AtomicReference<>();

            CefApp.addAppHandler(new CefAppHandlerAdapter(args != null ? args : new String[0]) {
                @Override
                public void stateHasChanged(CefApp.CefAppState state) {
                    if (state == CefApp.CefAppState.TERMINATED) {
                        System.exit(0);
                    }
                }

                @Override
                public void onContextInitialized() {
                    super.onContextInitialized();
                    ready.countDown();
                }

                @Override
                public void onBeforeCommandLineProcessing(String processType, CefCommandLine commandLine) {
                    super.onBeforeCommandLineProcessing(processType, commandLine);
                    CefRuntimeConfig.applyCommandLine(commandLine);
                }
            });

            try {
                CefApp.startup(appArgs);
                CefApp cefApp = CefApp.getInstance(appArgs, settings);
                if (cefApp == null) {
                    throw new IllegalStateException(
                            "CefApp.getInstance returned null — use a JetBrains Runtime with JCEF "
                                    + "(jbr_jcef). Tip: npm run dist downloads it under "
                                    + "datawise-desktop/target/jbr-cache, or set JAVA_HOME to jbr_jcef.");
                }
                if (!ready.await(120, TimeUnit.SECONDS)) {
                    throw new IllegalStateException(
                            "CEF context initialization timed out after 120s. "
                                    + "Confirm JAVA_HOME is a jbr_jcef runtime (not a plain JDK).");
                }
                if (failure.get() != null) {
                    throw failure.get();
                }
                instance = cefApp;
                System.out.println("[datawise-desktop] JetBrains JCEF ready, state=" + CefApp.getState());
                return cefApp;
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw e;
            } catch (RuntimeException e) {
                throw e;
            } catch (Exception e) {
                throw new IllegalStateException("Failed to start JCEF: " + e.getMessage(), e);
            }
        }
    }

    public static void disposeQuietly() {
        try {
            CefApp app = instance;
            if (app != null) {
                app.dispose();
            } else if (CefApp.getState() != CefApp.CefAppState.NONE
                    && CefApp.getState() != CefApp.CefAppState.TERMINATED) {
                CefApp.getInstance().dispose();
            }
        } catch (Exception ignored) {
        } finally {
            instance = null;
        }
    }
}
