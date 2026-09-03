-- ==============================================================================
-- FIX SUPABASE AUTH 500 ERROR & SYNC tech@lanetrailers.com TO Tech-support
-- Safe to run in Supabase SQL Editor
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Fix null GoTrue scan error on auth.users for existing and new users
UPDATE auth.users
SET 
  email_change = COALESCE(email_change, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change = COALESCE(phone_change, ''),
  reauthentication_token = COALESCE(reauthentication_token, ''),
  email_change_confirm_status = COALESCE(email_change_confirm_status, 0);

-- 2. Upsert / update tech@lanetrailers.com to Tech-support with password 'Lane'
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = 'tech@lanetrailers.com';

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change, email_change_token_new, email_change_token_current,
      phone_change, reauthentication_token, email_change_confirm_status
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      'tech@lanetrailers.com', crypt('Lane', gen_salt('bf')), now(),
      jsonb_build_object('provider', 'email', 'providers', array['email']),
      jsonb_build_object('name', 'Tech-support', 'role', 'manager'), now(), now(), '', '',
      '', '', '', '', '', 0
    );
  ELSE
    UPDATE auth.users 
    SET 
      encrypted_password = crypt('Lane', gen_salt('bf')),
      raw_user_meta_data = jsonb_build_object('name', 'Tech-support', 'role', 'manager'),
      email_change = COALESCE(email_change, ''),
      email_change_token_new = COALESCE(email_change_token_new, ''),
      email_change_token_current = COALESCE(email_change_token_current, ''),
      phone_change = COALESCE(phone_change, ''),
      reauthentication_token = COALESCE(reauthentication_token, ''),
      email_confirmed_at = now(),
      updated_at = now()
    WHERE id = v_user_id;
  END IF;

  -- Sync public.profiles row
  INSERT INTO public.profiles (id, name, role)
  VALUES (v_user_id, 'Tech-support', 'manager')
  ON CONFLICT (id) DO UPDATE SET name = 'Tech-support', role = 'manager';
END $$;
