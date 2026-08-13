-- ====================================================================
-- PRODUCTION MANAGEMENT — INTERNAL MESSAGING V1 MIGRATION (IDEMPOTENT)
-- ====================================================================

-- 1. PROFILES TABLE
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    name text not null,
    role text not null check (role in ('worker', 'manager')),
    created_at timestamptz not null default now()
);

-- 2. MESSAGES TABLE
create table if not exists public.messages (
    id uuid primary key default gen_random_uuid(),
    sender_id uuid not null references auth.users(id) on delete cascade,
    recipient_type text not null check (recipient_type in ('user', 'everyone')),
    recipient_id uuid,
    body text not null,
    created_at timestamptz not null default now(),
    read_at timestamptz
);

-- 3. MESSAGE READS TABLE
create table if not exists public.message_reads (
    message_id uuid not null references public.messages(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    read_at timestamptz not null default now(),
    primary key (message_id, user_id)
);

-- INDEXES FOR PERFORMANCE
create index if not exists idx_messages_sender_id on public.messages(sender_id);
create index if not exists idx_messages_recipient_id on public.messages(recipient_id);
create index if not exists idx_messages_created_at on public.messages(created_at desc);
create index if not exists idx_messages_recipient_type_created on public.messages(recipient_type, created_at desc);
create index if not exists idx_message_reads_user on public.message_reads(user_id, message_id);

-- ENABLE ROW LEVEL SECURITY (RLS)
alter table public.profiles enable row level security;
alter table public.messages enable row level security;
alter table public.message_reads enable row level security;

-- RLS POLICIES FOR PROFILES
drop policy if exists "Allow authenticated read profiles" on public.profiles;
create policy "Allow authenticated read profiles"
    on public.profiles for select to authenticated using (true);

drop policy if exists "Allow user insert own profile" on public.profiles;
create policy "Allow user insert own profile"
    on public.profiles for insert to authenticated with check (auth.uid() = id);

drop policy if exists "Allow user update own profile" on public.profiles;
create policy "Allow user update own profile"
    on public.profiles for update to authenticated using (auth.uid() = id);

-- RLS POLICIES FOR MESSAGES
drop policy if exists "Allow authenticated read relevant messages" on public.messages;
create policy "Allow authenticated read relevant messages"
    on public.messages for select to authenticated
    using (
        sender_id = auth.uid()
        or recipient_type = 'user'
        or recipient_type = 'everyone'
    );

drop policy if exists "Allow authenticated insert own messages" on public.messages;
create policy "Allow authenticated insert own messages"
    on public.messages for insert to authenticated
    with check (sender_id = auth.uid());

drop policy if exists "Allow recipient or sender update message" on public.messages;
create policy "Allow recipient or sender update message"
    on public.messages for update to authenticated
    using (true);

-- RLS POLICIES FOR MESSAGE READS
drop policy if exists "Allow user read own message_reads" on public.message_reads;
create policy "Allow user read own message_reads"
    on public.message_reads for select to authenticated using (user_id = auth.uid());

drop policy if exists "Allow user insert own message_reads" on public.message_reads;
create policy "Allow user insert own message_reads"
    on public.message_reads for insert to authenticated with check (user_id = auth.uid());

-- SAFE IDEMPOTENT REALTIME REPLICATION ADDITION
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' 
    and schemaname = 'public' 
    and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
