package org.apache.datawise.backend.connector.api.support;

import org.apache.datawise.backend.jdbc.support.ResultSetColumnMapper;
import org.junit.jupiter.api.Test;

import java.sql.ResultSetMetaData;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ResultSetColumnMapperTest {

    @Test
    void duplicateLabelsGetUniqueKeysAndDisambiguatedNames() throws Exception {
        ResultSetMetaData meta = mock(ResultSetMetaData.class);
        when(meta.getColumnCount()).thenReturn(3);
        when(meta.getColumnLabel(1)).thenReturn("id");
        when(meta.getColumnLabel(2)).thenReturn("tag_name");
        when(meta.getColumnLabel(3)).thenReturn("id");
        when(meta.getColumnTypeName(1)).thenReturn("BIGINT");
        when(meta.getColumnTypeName(2)).thenReturn("VARCHAR");
        when(meta.getColumnTypeName(3)).thenReturn("BIGINT");
        when(meta.getTableName(1)).thenReturn("cdp_tag");
        when(meta.getTableName(2)).thenReturn("cdp_tag");
        when(meta.getTableName(3)).thenReturn("cdp_segment");

        List<ResultSetColumnMapper.ColumnField> fields = ResultSetColumnMapper.buildFields(meta);

        assertEquals(3, fields.size());
        assertEquals("c1", fields.get(0).key());
        assertEquals("id", fields.get(0).name());
        assertEquals("c2", fields.get(1).key());
        assertEquals("tag_name", fields.get(1).name());
        assertEquals("c3", fields.get(2).key());
        assertEquals("cdp_segment.id", fields.get(2).name());
    }
}
