export type ReportTemplateCategory = 'daily' | 'funnel' | 'retention' | 'ops'

export interface ReportSqlTemplate {
    id: string
    category: ReportTemplateCategory
    /** Stable tag keys → shortcut.bookmarks.templateTags.* */
    tagKeys: string[]
    sql: string
}

/** Built-in report SQL templates (FB-086). Labels come from i18n. */
export const REPORT_SQL_TEMPLATES: ReportSqlTemplate[] = [
    {
        id: 'daily-order-summary',
        category: 'daily',
        tagKeys: ['daily', 'orders'],
        sql: `-- Daily: order summary
SELECT
  DATE(created_at) AS stat_date,
  COUNT(*) AS order_count,
  SUM(amount) AS gmv
FROM orders
WHERE created_at >= \${start_date}
  AND created_at < \${end_date}
GROUP BY DATE(created_at)
ORDER BY stat_date;`,
    },
    {
        id: 'daily-new-users',
        category: 'daily',
        tagKeys: ['daily', 'users'],
        sql: `-- Daily: new users
SELECT
  DATE(created_at) AS stat_date,
  COUNT(*) AS new_users
FROM users
WHERE created_at >= \${start_date}
  AND created_at < \${end_date}
GROUP BY DATE(created_at)
ORDER BY stat_date;`,
    },
    {
        id: 'funnel-conversion',
        category: 'funnel',
        tagKeys: ['funnel', 'conversion'],
        sql: `-- Funnel: register → order → pay
WITH registered AS (
  SELECT COUNT(DISTINCT user_id) AS cnt
  FROM users
  WHERE created_at >= \${start_date} AND created_at < \${end_date}
),
ordered AS (
  SELECT COUNT(DISTINCT user_id) AS cnt
  FROM orders
  WHERE created_at >= \${start_date} AND created_at < \${end_date}
),
paid AS (
  SELECT COUNT(DISTINCT user_id) AS cnt
  FROM orders
  WHERE status = 'paid'
    AND created_at >= \${start_date} AND created_at < \${end_date}
)
SELECT
  r.cnt AS registered,
  o.cnt AS ordered,
  p.cnt AS paid,
  ROUND(o.cnt * 100.0 / NULLIF(r.cnt, 0), 2) AS order_rate_pct,
  ROUND(p.cnt * 100.0 / NULLIF(o.cnt, 0), 2) AS pay_rate_pct
FROM registered r, ordered o, paid p;`,
    },
    {
        id: 'funnel-step-events',
        category: 'funnel',
        tagKeys: ['funnel', 'events'],
        sql: `-- Funnel: UV by event
SELECT
  event_name,
  COUNT(DISTINCT user_id) AS uv
FROM events
WHERE event_time >= \${start_date}
  AND event_time < \${end_date}
  AND event_name IN ('view', 'add_cart', 'checkout', 'pay')
GROUP BY event_name
ORDER BY uv DESC;`,
    },
    {
        id: 'retention-cohort-7d',
        category: 'retention',
        tagKeys: ['retention', 'cohort'],
        sql: `-- Retention: cohort × 7-day return
WITH cohort AS (
  SELECT id AS user_id, DATE(created_at) AS cohort_date
  FROM users
  WHERE created_at >= \${start_date} AND created_at < \${end_date}
),
activity AS (
  SELECT DISTINCT user_id, DATE(event_time) AS active_date
  FROM events
  WHERE event_time >= \${start_date}
)
SELECT
  c.cohort_date,
  COUNT(DISTINCT c.user_id) AS cohort_size,
  COUNT(DISTINCT CASE WHEN DATEDIFF(a.active_date, c.cohort_date) = 1 THEN c.user_id END) AS d1,
  COUNT(DISTINCT CASE WHEN DATEDIFF(a.active_date, c.cohort_date) = 7 THEN c.user_id END) AS d7
FROM cohort c
LEFT JOIN activity a ON a.user_id = c.user_id
GROUP BY c.cohort_date
ORDER BY c.cohort_date;`,
    },
    {
        id: 'retention-weekly-active',
        category: 'retention',
        tagKeys: ['retention', 'active'],
        sql: `-- Retention: weekly active users
SELECT
  DATE_TRUNC('week', event_time) AS week_start,
  COUNT(DISTINCT user_id) AS wau
FROM events
WHERE event_time >= \${start_date}
  AND event_time < \${end_date}
GROUP BY DATE_TRUNC('week', event_time)
ORDER BY week_start;`,
    },
    {
        id: 'ops-kpi-dashboard',
        category: 'ops',
        tagKeys: ['ops', 'kpi'],
        sql: `-- Ops KPI
SELECT
  COUNT(DISTINCT o.id) AS order_count,
  COUNT(DISTINCT o.user_id) AS buyer_count,
  SUM(o.amount) AS gmv,
  ROUND(SUM(o.amount) / NULLIF(COUNT(DISTINCT o.id), 0), 2) AS avg_order_value,
  COUNT(DISTINCT u.id) AS new_users
FROM orders o
LEFT JOIN users u
  ON u.created_at >= \${start_date} AND u.created_at < \${end_date}
WHERE o.created_at >= \${start_date}
  AND o.created_at < \${end_date};`,
    },
    {
        id: 'ops-top-products',
        category: 'ops',
        tagKeys: ['ops', 'ranking'],
        sql: `-- Ops: top products
SELECT
  product_id,
  SUM(quantity) AS units,
  SUM(amount) AS gmv
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE o.created_at >= \${start_date}
  AND o.created_at < \${end_date}
GROUP BY product_id
ORDER BY gmv DESC
LIMIT 20;`,
    },
]

export const REPORT_TEMPLATE_CATEGORIES: ReportTemplateCategory[] = [
    'daily',
    'funnel',
    'retention',
    'ops',
]
