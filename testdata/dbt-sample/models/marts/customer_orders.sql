select
    o.order_id,
    o.order_date,
    o.amount,
    o.status as order_status,
    c.customer_id,
    c.customer_name,
    c.email,
    c.status as customer_status
from {{ ref('stg_orders') }} o
inner join {{ ref('stg_customers') }} c
    on o.customer_id = c.customer_id
