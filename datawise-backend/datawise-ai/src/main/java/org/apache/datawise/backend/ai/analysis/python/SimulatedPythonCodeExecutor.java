package org.apache.datawise.backend.ai.analysis.python;

import org.apache.datawise.backend.ai.config.AiPythonProperties;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.ai.domain.PythonExecutionResult;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

/**
 * 模拟 Python 分析：基于 SQL 结果集做描述统计，无需外部 Python 运行时。
 * 生产环境可切换 {@code datawise.ai.python.executor=process}。
 */
@Component
public class SimulatedPythonCodeExecutor implements PythonCodeExecutor {

    private final AiPythonProperties pythonProperties;

    public SimulatedPythonCodeExecutor(AiPythonProperties pythonProperties) {
        this.pythonProperties = pythonProperties;
    }

    @Override
    public boolean isAvailable() {
        return pythonProperties.isEnabled() && !pythonProperties.isProcessExecutor();
    }

    @Override
    public PythonExecutionResult execute(String code, ExecuteSqlResult sqlResult, String prompt) {
        if (sqlResult == null || sqlResult.rows() == null || sqlResult.rows().isEmpty()) {
            return PythonExecutionResult.failure("No SQL rows available for Python analysis", "");
        }
        List<Map<String, Object>> columns = sqlResult.columns() != null ? sqlResult.columns() : List.of();
        List<String> numericKeys = detectNumericColumns(columns, sqlResult.rows());
        StringBuilder out = new StringBuilder();
        out.append("Simulated pandas analysis\n");
        out.append("rows=").append(sqlResult.rowCount()).append('\n');
        for (String key : numericKeys) {
            NumericStats stats = statsForColumn(sqlResult.rows(), key);
            out.append(key)
                    .append(": count=").append(stats.count())
                    .append(", min=").append(stats.min())
                    .append(", max=").append(stats.max())
                    .append(", avg=").append(String.format(Locale.ROOT, "%.4f", stats.avg()))
                    .append('\n');
        }
        if (numericKeys.isEmpty()) {
            out.append("No numeric columns detected; inspect categorical distribution manually.\n");
        }
        return PythonExecutionResult.success(out.toString().trim());
    }

    private static List<String> detectNumericColumns(
            List<Map<String, Object>> columns,
            List<Map<String, Object>> rows
    ) {
        List<String> keys = new ArrayList<>();
        for (Map<String, Object> column : columns) {
            Object keyObj = column.get("key") != null ? column.get("key") : column.get("name");
            if (keyObj == null) {
                continue;
            }
            String key = String.valueOf(keyObj);
            if (rows.stream().limit(20).map(row -> row.get(key)).filter(Objects::nonNull).allMatch(SimulatedPythonCodeExecutor::isNumeric)) {
                keys.add(key);
            }
        }
        return keys;
    }

    private static boolean isNumeric(Object value) {
        if (value instanceof Number) {
            return true;
        }
        try {
            Double.parseDouble(String.valueOf(value).trim());
            return true;
        } catch (NumberFormatException ex) {
            return false;
        }
    }

    private static NumericStats statsForColumn(List<Map<String, Object>> rows, String key) {
        double min = Double.POSITIVE_INFINITY;
        double max = Double.NEGATIVE_INFINITY;
        double sum = 0D;
        int count = 0;
        for (Map<String, Object> row : rows) {
            Object raw = row.get(key);
            if (raw == null) {
                continue;
            }
            double value = raw instanceof Number number ? number.doubleValue() : Double.parseDouble(String.valueOf(raw));
            min = Math.min(min, value);
            max = Math.max(max, value);
            sum += value;
            count++;
        }
        double avg = count > 0 ? sum / count : 0D;
        return new NumericStats(count, min, max, avg);
    }

    private record NumericStats(int count, double min, double max, double avg) {
    }
}
