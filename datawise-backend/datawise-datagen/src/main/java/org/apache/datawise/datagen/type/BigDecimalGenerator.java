package org.apache.datawise.datagen.type;

import org.apache.datawise.datagen.type.base.IGenerator;

import java.math.BigDecimal;
import java.math.RoundingMode;

public final class BigDecimalGenerator implements IGenerator<BigDecimal> {

    @Override
    public BigDecimal generateData(String fieldName, GenContext ctx) {
        int seq = ctx.seq();
        String name = fieldName == null ? "" : fieldName.toLowerCase();
        boolean moneyLike = name.contains("amount") || name.contains("price") || name.contains("salary");
        double base = moneyLike ? (seq * 9.99d) : (seq * 1.23d);
        return BigDecimal.valueOf(base).setScale(2, RoundingMode.HALF_UP);
    }
}

