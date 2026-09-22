-- =============================================================================
-- YOYO GYMS — run this if you ALREADY ran RUN-THIS.sql
-- =============================================================================
-- `create table if not exists` does nothing to a table that already exists, so
-- it will not add these four columns. This does.
--
-- Safe: `add column if not exists` and `update ... where`, so running it twice
-- changes nothing the second time. It touches only the `platform` schema.
-- =============================================================================

-- 1. REMEMBERING A CARD, so a renewal can be charged without asking again.
--    paystack_auth_code is a token authorising future charges on that card.
--    It is NOT a card number and cannot be used to read one.
alter table platform.platform_subscriptions add column if not exists paystack_auth_code text;
alter table platform.platform_subscriptions add column if not exists paystack_customer  text;
alter table platform.platform_subscriptions add column if not exists card_brand         text;
alter table platform.platform_subscriptions add column if not exists card_last4         text;

-- 2. YOUR PRICES.
--    Stored in CENTS. R499.00 is 49900. Change these three numbers to whatever
--    you decide — they are data, and you can also change them later at
--    /platform/plans with no deploy and no SQL.
update platform.platform_plans set price_cents =  49900, currency = 'ZAR', updated_at = now() where key = 'basic';
update platform.platform_plans set price_cents =  99900, currency = 'ZAR', updated_at = now() where key = 'medium';
update platform.platform_plans set price_cents = 199900, currency = 'ZAR', updated_at = now() where key = 'prime';

-- =============================================================================
-- CHECK IT WORKED
-- =============================================================================
select key,
       label,
       max_active_members as members,
       price_cents,
       (price_cents / 100.0)::numeric(10,2) as rands
from platform.platform_plans
order by max_active_members;
