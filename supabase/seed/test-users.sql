-- Development only. Two confirmed accounts for scripts/verify-persistence.mjs.
--
-- Seeded by hand rather than through signUp() because this project has signup
-- restricted at the Supabase level, which is the correct production setting.
-- The password is hashed with bcrypt exactly as Supabase Auth does, so
-- signInWithPassword works against these rows.
--
-- Never run this against production.

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, confirmation_token,
  email_change, email_change_token_new, recovery_token
)
select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       e, crypt('ContourTest!2026', gen_salt('bf')),
       now(), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, '', '', '', ''
from (values ('persist-a@contour.test'), ('persist-b@contour.test')) as v(e)
where not exists (select 1 from auth.users u where u.email = v.e);
