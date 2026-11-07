package org.apache.datawise.backend.server.pack;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 * When {@code datawise-ai} is absent from the classpath (Standard / {@code -Pwithout-ai} fat jar),
 * activates the {@code without-ai} Spring profile so AI-typed server beans are not registered.
 */
public class WithoutAiEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {

    public static final String PROFILE = "without-ai";
    private static final String AI_MARKER = "org.apache.datawise.backend.ai.chat.AiService";

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        if (aiPresent()) {
            return;
        }
        Set<String> profiles = new LinkedHashSet<>(Arrays.asList(environment.getActiveProfiles()));
        if (profiles.add(PROFILE)) {
            environment.setActiveProfiles(profiles.toArray(String[]::new));
        }
        environment.getPropertySources().addFirst(new MapPropertySource(
                "datawiseWithoutAi",
                Map.of("datawise.ai.module-present", "false")
        ));
    }

    private static boolean aiPresent() {
        try {
            Class.forName(AI_MARKER, false, WithoutAiEnvironmentPostProcessor.class.getClassLoader());
            return true;
        } catch (ClassNotFoundException | NoClassDefFoundError ex) {
            return false;
        }
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE + 20;
    }
}
