-- ==============================================================================
-- RESET PASSWORD FOR tech@lanetrailers.com TO 'Lane'
-- Run this directly in your Supabase SQL Editor
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE auth.users 
SET 
  encrypted_password = crypt('Lane', gen_salt('bf')),
  email_confirmed_at = COALESCE(email_confirmed_at, now()),
  updated_at = now(),
  email_change = COALESCE(email_change, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change = COALESCE(phone_change, ''),
  reauthentication_token = COALESCE(reauthentication_token, ''),
  email_change_confirm_status = COALESCE(email_change_confirm_status, 0),
  raw_user_meta_data = jsonb_build_object('name', 'Tech-support', 'role', 'manager')
WHERE lower(email) = 'tech@lanetrailers.com';

-- Ensure profile exists and has correct name and role
INSERT INTO public.profiles (id, name, role)
SELECT id, 'Tech-support', 'manager'
FROM auth.users
WHERE lower(email) = 'tech@lanetrailers.com'
ON CONFLICT (id) DO UPDATE 
SET name = 'Tech-support', role = 'manager';
