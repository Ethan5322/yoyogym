-- 2026-09-29 — the four member services join the plans (CLAUDE.md §41.1 Q4,
-- vault D-165): Basic gets Pause; Medium adds Rewards, and Family and group;
-- Prime adds Challenges. Every one stays switchable on the Plans page.
--
-- NOT YET RUN. Idempotent: a service already in a plan is not added twice.

update platform.platform_plans p
   set features = (select jsonb_agg(distinct f) from jsonb_array_elements_text(p.features || '["freeze"]'::jsonb) as t(f)),
       updated_at = now()
 where key = 'basic';

update platform.platform_plans p
   set features = (select jsonb_agg(distinct f) from jsonb_array_elements_text(p.features || '["freeze","rewards","family"]'::jsonb) as t(f)),
       updated_at = now()
 where key = 'medium';

update platform.platform_plans p
   set features = (select jsonb_agg(distinct f) from jsonb_array_elements_text(p.features || '["freeze","rewards","family","challenges"]'::jsonb) as t(f)),
       updated_at = now()
 where key = 'prime';
