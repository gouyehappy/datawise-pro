package org.apache.datawise.backend.model;

/**
 * 分析画布可参数化占位符（如日期范围、门店 ID）。
 */
public class AiCanvasParameter {

    private String key;
    private String label;
    private String defaultValue;
    private String type = "string";

    public String getKey() {
        return key;
    }

    public void setKey(String key) {
        this.key = key;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public String getDefaultValue() {
        return defaultValue;
    }

    public void setDefaultValue(String defaultValue) {
        this.defaultValue = defaultValue;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }
}
