-- ====================================================================
-- SUPABASE AUTH REPAIR & USER PROVISIONING SCRIPT
-- Resolves "500: database error querying schema"
-- ====================================================================

-- 1. Ensure required extensions exist
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Ensure public.profiles table exists and has proper columns
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    role text NOT NULL CHECK (role IN ('worker', 'manager')),
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated read profiles" ON public.profiles;
CREATE POLICY "Allow authenticated read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Allow anon read profiles" ON public.profiles;
CREATE POLICY "Allow anon read profiles" ON public.profiles FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "Allow authenticated insert profiles" ON public.profiles;
CREATE POLICY "Allow authenticated insert profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow authenticated update profiles" ON public.profiles;
CREATE POLICY "Allow authenticated update profiles" ON public.profiles FOR UPDATE TO authenticated USING (true);

-- 3. Safely fix / drop any broken auth.users triggers if present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 4. Idempotently create/repair all 13 Users and their required auth.identities
DO $$
DECLARE
  u RECORD;
  new_id uuid;
  user_list JSONB := '[
    {"email": "logan@lanetrailers.com", "name": "Logan", "role": "manager"},
    {"email": "eric@lanetrailers.com", "name": "Eric", "role": "manager"},
    {"email": "darin@lanetrailers.com", "name": "Darin", "role": "manager"},
    {"email": "angie@lanetrailers.com", "name": "Angie", "role": "manager"},
    {"email": "lucas@lanetrailers.com", "name": "Lucas", "role": "manager"},
    {"email": "joel@lanetrailers.com", "name": "Joel", "role": "manager"},
    {"email": "manager@lanetrailers.com", "name": "Manager", "role": "manager"},
    {"email": "trim@lanetrailers.com", "name": "Trim", "role": "worker"},
    {"email": "paint@lanetrailers.com", "name": "Paint", "role": "worker"},
    {"email": "bay1@lanetrailers.com", "name": "Bay 1", "role": "worker"},
    {"email": "bay2@lanetrailers.com", "name": "Bay 2", "role": "worker"},
    {"email": "bay3@lantrailers.com", "name": "Bay 3", "role": "worker"},
    {"email": "bay3@lanetrailers.com", "name": "Bay 3", "role": "worker"},
    {"email": "bay4@lanetrailers.com", "name": "Bay 4", "role": "worker"},
    {"email": "prefab@lanetrailers.com", "name": "Prefab", "role": "worker"}
  ]'::jsonb;
BEGIN
  FOR u IN SELECT * FROM jsonb_to_recordset(user_list) AS x(email text, name text, role text)
  LOOP
    SELECT id INTO new_id FROM auth.users WHERE lower(email) = lower(u.email);

    IF new_id IS NULL THEN
      new_id := gen_random_uuid();
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
        is_super_admin,
        is_sso_user,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        new_id,
        'authenticated',
        'authenticated',
        lower(u.email),
        crypt('Road2Success', gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('name', u.name, 'role', u.role),
        false,
        false,
        now(),
        now(),
        '',
        '',
        '',
        ''
      );
    ELSE
      UPDATE auth.users 
      SET encrypted_password = crypt('Road2Success', gen_salt('bf')),
          email_confirmed_at = COALESCE(email_confirmed_at, now()),
          raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
          raw_user_meta_data = jsonb_build_object('name', u.name, 'role', u.role),
          aud = 'authenticated',
          role = 'authenticated',
          is_super_admin = false,
          is_sso_user = false,
          updated_at = now()
      WHERE id = new_id;
    END IF;

    -- Ensure matching GoTrue identity in auth.identities
    DELETE FROM auth.identities WHERE user_id = new_id;
    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      new_id,
      new_id,
      jsonb_build_object('sub', new_id::text, 'email', lower(u.email)),
      'email',
      lower(u.email),
      now(),
      now(),
      now()
    );

    -- Ensure profiles table entry
    INSERT INTO public.profiles (id, name, role, created_at)
    VALUES (new_id, u.name, u.role, now())
    ON CONFLICT (id) DO UPDATE 
    SET name = EXCLUDED.name,
        role = EXCLUDED.role;

  END LOOP;
END $$;

-- 5. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
