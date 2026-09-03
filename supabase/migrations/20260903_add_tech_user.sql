-- ========================================================
-- ADD USER: tech@lanetrailers.com (Password: Lane)
-- Safe to run multiple times in Supabase SQL Editor
-- ========================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Check if user already exists
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = 'tech@lanetrailers.com';

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    
    -- Insert into auth.users with password 'Lane'
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      'tech@lanetrailers.com',
      crypt('Lane', gen_salt('bf')),
      now(),
      jsonb_build_object('provider', 'email', 'providers', array['email']),
      jsonb_build_object('name', 'Tech', 'role', 'manager'),
      now(),
      now(),
      '',
      ''
    );
  ELSE
    -- If user already exists, update password to 'Lane'
    UPDATE auth.users 
    SET encrypted_password = crypt('Lane', gen_salt('bf')),
        email_confirmed_at = now(),
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  -- Ensure profile exists in public.profiles
  INSERT INTO public.profiles (id, name, role)
  VALUES (v_user_id, 'Tech', 'manager')
  ON CONFLICT (id) DO UPDATE SET
    name = 'Tech',
    role = 'manager';
END $$;
