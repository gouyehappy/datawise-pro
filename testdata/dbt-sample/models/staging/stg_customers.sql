with source as (
    select * from {{ ref('raw_customers') }}
)

select
    cast(customer_id as integer) as customer_id,
    trim(customer_name) as customer_name,
    lower(email) as email,
    lower(status) as status,
    cast(created_at as date) as created_at
from source
