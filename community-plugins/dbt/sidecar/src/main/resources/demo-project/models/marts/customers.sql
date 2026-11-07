select
    customer_id,
    customer_name,
    status
from {{ ref('stg_customers') }}
where status = 'active'
