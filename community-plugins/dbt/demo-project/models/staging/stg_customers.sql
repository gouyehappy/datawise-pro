-- Demo staging model (no warehouse required to list / preview source).
select
    1 as customer_id,
    'Ada' as customer_name,
    'active' as status
union all
select
    2 as customer_id,
    'Grace' as customer_name,
    'active' as status
