package org.apache.datawise.sqlparser;

public interface Handler<T> {

    void handle(T obj, VisitorContext visitorContext);

    Class<? extends T> handleType();
}
