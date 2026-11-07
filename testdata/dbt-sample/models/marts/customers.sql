with customers as (
    select * from {{ ref('stg_customers') }}
),

orders as (
    select * from {{ ref('stg_orders') }}
),

order_stats as (
    select
        customer_id,
        count(*) as order_count,
        sum(amount) as lifetime_value,
        min(order_date) as first_order_date,
        max(order_date) as last_order_date
    from orders
    where status = 'completed'
    group by customer_id
)

select
    c.customer_id,
    c.customer_name,
    c.email,
    c.status,
    c.created_at,
    coalesce(o.order_count, 0) as order_count,
    coalesce(o.lifetime_value, 0) as lifetime_value,
    o.first_order_date,
    o.last_order_date
from customers c
left join order_stats o using (customer_id)
where c.status = '{{ var("active_status") }}'
