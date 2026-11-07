package org.apache.datawise.backend.domain.pack;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Living suite × pack matrix — keep in sync with FE SUITE_CATALOG / PRODUCT_EXTENSION_PACKS §3.3.
 */
class PackCompatMatrixTest {

    @Test
    void suiteMatrixMatchesFrozenDesign() {
        assertEquals(
                Set.of(PackIds.AI, PackIds.GOVERNANCE),
                Set.copyOf(PackSuiteMap.packsForSuite(PackSuiteMap.SUITE_PRO)));
        assertEquals(
                Set.copyOf(PackSuiteMap.ENTERPRISE_CORE),
                Set.copyOf(PackSuiteMap.packsForSuite(PackSuiteMap.SUITE_ENTERPRISE)));
        List<String> platform = PackSuiteMap.packsForSuite(PackSuiteMap.SUITE_PLATFORM);
        assertTrue(platform.containsAll(PackSuiteMap.ENTERPRISE_CORE));
        assertTrue(platform.contains(PackIds.DATAGEN));
        assertTrue(platform.contains(PackIds.CONNECTOR_DOMESTIC));
    }

    @Test
    void markdownTableIsStable() {
        String md = PackCompatMatrix.renderMarkdown();
        assertTrue(md.contains("`suite.pro`"));
        assertTrue(md.contains("pack.ai"));
        assertTrue(md.contains("MetaDoc"));
    }

    /** Helper used by docs generator / CI. */
    static final class PackCompatMatrix {

        private PackCompatMatrix() {
        }

        static String renderMarkdown() {
            StringBuilder sb = new StringBuilder();
            sb.append("# Pack 兼容矩阵（自动对齐 PackSuiteMap）\n\n");
            sb.append("> 由 `PackCompatMatrixTest` 断言；勿手工改套餐列而不改代码。\n\n");
            sb.append("| Suite | Packs | MetaDoc |\n");
            sb.append("|-------|-------|--------|\n");
            for (String suite : List.of(
                    PackSuiteMap.SUITE_PRO,
                    PackSuiteMap.SUITE_ENTERPRISE,
                    PackSuiteMap.SUITE_PLATFORM)) {
                List<String> packs = new ArrayList<>(PackSuiteMap.packsForSuite(suite));
                boolean meta = PackSuiteMap.grantsMetaDoc(suite, Set.copyOf(packs));
                sb.append("| `").append(suite).append("` | ")
                        .append(String.join(", ", packs.stream().map(p -> "`" + p + "`").toList()))
                        .append(" | ").append(meta ? "是" : "否").append(" |\n");
            }
            sb.append("\n## Free connectors\n\n");
            sb.append("MySQL, MariaDB, PostgreSQL, SQLite（无 Pack）\n");
            return sb.toString();
        }
    }
}
