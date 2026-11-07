package org.apache.datawise.datagen.type;

import net.datafaker.Faker;

import java.util.Random;

/**
 * 数据生成上下文：携带 Faker、seed 对应的随机源，并提供当前行号（用于可重复的序列化规则）。
 */
public final class GenContext {

    private final Faker faker;
    private final Random random;
    private int rowIndex;

    public GenContext(Faker faker, Random random) {
        this.faker = faker;
        this.random = random;
        this.rowIndex = 0;
    }

    public Faker faker() {
        return faker;
    }

    public Random random() {
        return random;
    }

    public int rowIndex() {
        return rowIndex;
    }

    public void setRowIndex(int rowIndex) {
        this.rowIndex = rowIndex;
    }

    public int seq() {
        return rowIndex + 1;
    }
}

