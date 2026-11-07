package org.apache.datawise.backend.ai.support;

import org.apache.datawise.backend.ai.domain.AiAnalysisContextDto;
import org.apache.datawise.backend.ai.domain.AiDatabaseTargetDto;

import java.util.List;
import java.util.regex.Pattern;

/**
 * 判断用户是否在请求数据分析（NL2SQL + 查询 + 图表）
 */
public final class AiAnalysisIntentDetector {

    private static final Pattern ANALYSIS = Pattern.compile(
            "(分析|统计|趋势|对比|占比|分布|汇总|报表|情况|销量|销售|收入|订单|"
                    + "analyze|analysis|trend|compare|distribution|report|chart|sales|revenue)",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );

    private static final Pattern FOLLOW_UP = Pattern.compile(
            "(只要|换成|改成|改为|限制|筛选|只看|季度|Q[1-4]|"
                    + "柱状|折线|饼图|bar|line|pie|filter|only|change|switch)",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );

    private static final Pattern NON_ANALYSIS = Pattern.compile(
            "(解释|优化|explain|optimize|fix|翻译|translate|"
                    + "summarize|summary|摘要|"
                    + "Summarize this SQL query result)",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );

    private AiAnalysisIntentDetector() {
    }

    public static boolean isAnalysisIntent(String prompt, List<AiDatabaseTargetDto> targets) {
        return isAnalysisIntent(prompt, targets, null);
    }

    public static boolean isAnalysisIntent(
            String prompt,
            List<AiDatabaseTargetDto> targets,
            AiAnalysisContextDto context
    ) {
        if (prompt == null || prompt.isBlank()) {
            return false;
        }
        if (NON_ANALYSIS.matcher(prompt).find()) {
            return false;
        }
        if (targets == null || targets.isEmpty()) {
            return false;
        }
        boolean hasScope = targets.stream().anyMatch(AiAnalysisIntentDetector::hasExecutableScope);
        if (!hasScope) {
            return false;
        }
        if (hasPriorContext(context) && FOLLOW_UP.matcher(prompt).find()) {
            return true;
        }
        return ANALYSIS.matcher(prompt).find();
    }

    private static boolean hasPriorContext(AiAnalysisContextDto context) {
        return context != null
                && context.previousSql() != null
                && !context.previousSql().isBlank();
    }

    private static boolean hasExecutableScope(AiDatabaseTargetDto target) {
        return target != null
                && target.connectionId() != null
                && !target.connectionId().isBlank();
    }
}
