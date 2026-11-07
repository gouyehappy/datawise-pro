package org.apache.datawise.sqlparser;

import net.sf.jsqlparser.schema.Column;
import net.sf.jsqlparser.schema.Table;
import net.sf.jsqlparser.statement.select.PlainSelect;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

class VisitorContextTest {

    @Test
    void getSqlHandler_cachesResolvedHandlersByTargetClass() {
        VisitorContext context = new VisitorContext();
        AtomicInteger calls = new AtomicInteger();
        context.addSqlHandler(Table.class, handler(Table.class, (table, ctx) -> calls.incrementAndGet()));

        List<Handler<Object>> first = context.getSqlHandler(Table.class);
        List<Handler<Object>> second = context.getSqlHandler(Table.class);

        assertSame(first, second);
        assertEquals(1, first.size());
    }

    @Test
    void addSqlHandler_invalidatesResolvedCache() {
        VisitorContext context = new VisitorContext();
        context.addSqlHandler(Table.class, handler(Table.class, (table, ctx) -> { }));
        List<Handler<Object>> before = context.getSqlHandler(Table.class);

        context.addSqlHandler(Column.class, handler(Column.class, (column, ctx) -> { }));
        List<Handler<Object>> after = context.getSqlHandler(Table.class);

        assertEquals(1, before.size());
        assertEquals(1, after.size());
        assertTrue(before != after);
    }

    @Test
    void getPrePlainSelectParamMap_returnsParentWithoutArrayCopy() {
        VisitorContext context = new VisitorContext();
        PlainSelect outer = new PlainSelect();
        PlainSelect inner = new PlainSelect();
        context.pushPlainSelect(outer);
        context.pushPlainSelect(inner);

        Map<String, Object> parentMap = context.getPrePlainSelectParamMap();
        assertNotNull(parentMap);
        parentMap.put("k", "v");

        context.popPlainSelect();
        assertEquals("v", context.getCurrentPlainSelectParamMap().get("k"));
        assertNull(context.getPrePlainSelectParamMap());
    }

    @Test
    void invokeHandlers_skipsAbandonedHandlersWithIdentityLookup() {
        VisitorContext context = new VisitorContext();
        List<String> seen = new ArrayList<>();
        Handler<Table> keep = handler(Table.class, (table, ctx) -> seen.add("keep"));
        Handler<Table> abandon = handler(Table.class, (table, ctx) -> seen.add("abandon"));
        context.addSqlHandler(Table.class, keep);
        context.addSqlHandler(Table.class, abandon);
        context.doNotExcuteThisHandlerAgain(abandon);

        context.invokeHandlers(new Table());

        assertEquals(List.of("keep"), seen);
    }

    private static <T> Handler<T> handler(Class<T> type, java.util.function.BiConsumer<T, VisitorContext> action) {
        return new Handler<>() {
            @Override
            public void handle(T obj, VisitorContext visitorContext) {
                action.accept(obj, visitorContext);
            }

            @Override
            public Class<? extends T> handleType() {
                return type;
            }
        };
    }
}
