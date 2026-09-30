-- What a person at Yoyo Gyms delivers, and the free trial, per plan
-- (CLAUDE.md §47.1 Q4) — switched on the Plans page. Seeded with what the
-- plans promised until now (§41.1 Q6), so nothing an owner was told changes.

alter table platform.platform_plans add column if not exists promises jsonb;
alter table platform.platform_plans add column if not exists trial_days integer;

update platform.platform_plans set promises = '["setup_help","member_import_help","email_support"]'::jsonb
 where key = 'basic' and promises is null;
update platform.platform_plans set promises = '["setup_help","member_import_help","email_support","same_day_replies"]'::jsonb
 where key = 'medium' and promises is null;
update platform.platform_plans set promises = '["setup_help","member_import_help","email_support","same_day_replies","whatsapp_line","account_manager"]'::jsonb
 where key = 'prime' and promises is null;
update platform.platform_plans set trial_days = 30 where trial_days is null;
