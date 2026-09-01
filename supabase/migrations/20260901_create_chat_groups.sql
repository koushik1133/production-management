-- ====================================================================
-- SUPABASE CHAT GROUPS & CHANNELS TABLE (IDEMPOTENT)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.chat_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    admin_ids uuid[] DEFAULT '{}',
    member_ids uuid[] DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chat_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read chat_groups" ON public.chat_groups;
CREATE POLICY "Allow authenticated read chat_groups" ON public.chat_groups FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert chat_groups" ON public.chat_groups;
CREATE POLICY "Allow authenticated insert chat_groups" ON public.chat_groups FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated update chat_groups" ON public.chat_groups;
CREATE POLICY "Allow authenticated update chat_groups" ON public.chat_groups FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated delete chat_groups" ON public.chat_groups;
CREATE POLICY "Allow authenticated delete chat_groups" ON public.chat_groups FOR DELETE TO authenticated USING (true);

-- Enable Realtime for chat_groups
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_groups;

NOTIFY pgrst, 'reload schema';
