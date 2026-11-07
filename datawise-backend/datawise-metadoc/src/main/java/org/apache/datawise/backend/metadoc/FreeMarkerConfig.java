package org.apache.datawise.backend.metadoc;

import freemarker.template.Configuration;
import freemarker.template.Template;
import freemarker.template.TemplateExceptionHandler;

import java.io.StringWriter;
import java.util.Map;

/**
 * FreeMarker 模板渲染（仅用于 Markdown/HTML 预览导出）。
 */
public final class FreeMarkerConfig {

    private static volatile Configuration instance;

    private FreeMarkerConfig() {
    }

    public static Configuration getInstance() {
        if (instance == null) {
            synchronized (FreeMarkerConfig.class) {
                if (instance == null) {
                    // Use a compatibility baseline available across older runtime FreeMarker versions.
                    Configuration cfg = new Configuration(Configuration.DEFAULT_INCOMPATIBLE_IMPROVEMENTS);
                    // resources/templates 作为模板加载根目录
                    cfg.setClassForTemplateLoading(FreeMarkerConfig.class, "/templates");
                    cfg.setDefaultEncoding("UTF-8");
                    cfg.setTemplateExceptionHandler(TemplateExceptionHandler.RETHROW_HANDLER);
                    cfg.setLogTemplateExceptions(false);
                    instance = cfg;
                }
            }
        }
        return instance;
    }

    public static String render(String templatePath, Map<String, Object> model) {
        try {
            Template template = getInstance().getTemplate(templatePath);
            try (StringWriter writer = new StringWriter()) {
                template.process(model, writer);
                return writer.toString();
            }
        } catch (Exception e) {
            throw new IllegalStateException("Failed to render template: " + templatePath, e);
        }
    }
}

