-- Every active customer in the mart must have an email.
select customer_id
from {{ ref('customers') }}
where email is null or trim(email) = ''
