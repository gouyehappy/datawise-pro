package org.apache.datawise.backend.ddl;

public record DdlRenderOptions(
        boolean includeDropIfExists,
        boolean includeComments,
        String targetDatabase,
        String targetDbType) {

    public static DdlRenderOptions defaults() {
        return new DdlRenderOptions(false, true, null, null);
    }

    public static DdlRenderOptions forTarget(String targetDatabase, String targetDbType) {
        return new DdlRenderOptions(false, true, targetDatabase, targetDbType);
    }
}
