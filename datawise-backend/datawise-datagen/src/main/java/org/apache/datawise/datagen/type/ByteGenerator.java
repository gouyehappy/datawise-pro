package org.apache.datawise.datagen.type;

import org.apache.datawise.datagen.type.base.IGenerator;

public final class ByteGenerator implements IGenerator<Byte> {

    @Override
    public Byte generateData(String fieldName, GenContext ctx) {
        int n = 1 + (ctx.rowIndex() % 120);
        return (byte) n;
    }
}

