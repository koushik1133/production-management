-- ====================================================================
-- SUPABASE AUTH & RBAC USER PROVISIONING (IDEMPOTENT)
-- Password for all users: Road2Success
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ensure profiles table exists
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    role text NOT NULL CHECK (role IN ('worker', 'manager')),
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated read profiles" ON public.profiles;
CREATE POLICY "Allow authenticated read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Allow user insert own profile" ON public.profiles;
CREATE POLICY "Allow user insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Allow user update own profile" ON public.profiles;
CREATE POLICY "Allow user update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Seed / Update Users and Profiles
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
    SELECT id INTO new_id FROM auth.users WHERE email = u.email;

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
        created_at,
        updated_at,
        confirmation_token,
        recovery_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        new_id,
        'authenticated',
        'authenticated',
        u.email,
        crypt('Road2Success', gen_salt('bf')),
        now(),
        jsonb_build_object('provider', 'email', 'providers', array['email']),
        jsonb_build_object('name', u.name, 'role', u.role),
        now(),
        now(),
        '',
        ''
      );
    ELSE
      UPDATE auth.users 
      SET encrypted_password = crypt('Road2Success', gen_salt('bf')),
          email_confirmed_at = COALESCE(email_confirmed_at, now()),
          raw_user_meta_data = jsonb_build_object('name', u.name, 'role', u.role),
          updated_at = now()
      WHERE id = new_id;
    END IF;

    INSERT INTO public.profiles (id, name, role, created_at)
    VALUES (new_id, u.name, u.role, now())
    ON CONFLICT (id) DO UPDATE 
    SET name = EXCLUDED.name,
        role = EXCLUDED.role;

  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
