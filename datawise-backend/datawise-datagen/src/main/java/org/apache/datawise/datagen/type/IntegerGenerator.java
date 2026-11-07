package org.apache.datawise.datagen.type;

import org.apache.datawise.datagen.type.base.IGenerator;

public final class IntegerGenerator implements IGenerator<Integer> {

    @Override
    public Integer generateData(String fieldName, GenContext ctx) {
        return 1000 + ctx.rowIndex();
    }
}

