package org.apache.datawise.backend.domain;

import java.util.List;

/** MySQL-family character set / collation picklists. */
public record MysqlCharsetOptionsResult(
        List<MysqlCharsetOption> charsets,
        List<MysqlCollationOption> collations) {

    public record MysqlCharsetOption(String name, String description, String defaultCollation) {
    }

    public record MysqlCollationOption(String name, String charset, boolean isDefault) {
    }
}
