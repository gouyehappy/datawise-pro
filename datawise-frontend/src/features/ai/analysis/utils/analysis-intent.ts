const ANALYSIS_RE =
    /分析|统计|趋势|对比|占比|分布|汇总|报表|情况|销量|销售|收入|订单|analyze|analysis|trend|compare|distribution|report|chart|sales|revenue/i

const NON_ANALYSIS_RE =
    /解释|优化|explain|optimize|fix|翻译|translate|summarize|summary|摘要|Summarize this SQL query result/i

const FOLLOW_UP_RE =
    /只要|换成|改成|改为|限制|筛选|只看|季度|Q[1-4]|柱状|折线|饼图|bar|line|pie|filter|only|change|switch/i

/** 与后端 AiAnalysisIntentDetector 对齐 */
export function isAnalysisPrompt(
    prompt: string,
    hasTargets: boolean,
    priorContext?: { previousSql: string },
): boolean {
    const text = prompt.trim()
    if (!text || !hasTargets) return false
    if (NON_ANALYSIS_RE.test(text)) return false
    if (priorContext?.previousSql && FOLLOW_UP_RE.test(text)) return true
    return ANALYSIS_RE.test(text)
}
