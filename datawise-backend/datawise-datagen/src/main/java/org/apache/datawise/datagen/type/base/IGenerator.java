package org.apache.datawise.datagen.type.base;

import org.apache.datawise.datagen.type.GenContext;

public interface IGenerator<T> {

    T generateData(String fieldName, GenContext ctx);
}

