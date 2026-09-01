-- ====================================================================
-- SUPABASE AUTH FIX: NULL TOKENS RESOLUTION
-- Fixes "500: Database error querying schema" on signInWithPassword
-- ====================================================================

-- 1. Convert all NULL string token columns in auth.users to empty strings
UPDATE auth.users
SET 
  confirmation_token = COALESCE(confirmation_token, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  recovery_token = COALESCE(recovery_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  email_change_confirm_status = COALESCE(email_change_confirm_status, 0),
  is_sso_user = COALESCE(is_sso_user, false),
  is_super_admin = COALESCE(is_super_admin, false),
  is_anonymous = COALESCE(is_anonymous, false),
  aud = 'authenticated',
  role = 'authenticated',
  email_confirmed_at = COALESCE(email_confirmed_at, now());

-- 2. Ensure identities table matches auth.users
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT 
  id,
  id,
  jsonb_build_object('sub', id::text, 'email', lower(email)),
  'email',
  lower(email),
  now(),
  now(),
  now()
FROM auth.users
ON CONFLICT (provider, provider_id) DO UPDATE
SET identity_data = EXCLUDED.identity_data,
    updated_at = now();

NOTIFY pgrst, 'reload schema';
