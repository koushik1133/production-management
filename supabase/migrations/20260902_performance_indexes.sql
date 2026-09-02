-- ====================================================================
-- PERFORMANCE TUNING & INDEXES MIGRATION
-- Prevents query timeouts (57014) and pool exhaustion
-- ====================================================================

-- 1. Indexes on public.trailers
CREATE INDEX IF NOT EXISTS idx_trailers_vertical_order ON public.trailers (vertical_order ASC);
CREATE INDEX IF NOT EXISTS idx_trailers_serial_number ON public.trailers ("serialNumber");
CREATE INDEX IF NOT EXISTS idx_trailers_is_archived_deleted ON public.trailers ("isArchived", "isDeleted");
CREATE INDEX IF NOT EXISTS idx_trailers_station ON public.trailers (station);
CREATE INDEX IF NOT EXISTS idx_trailers_current_phase ON public.trailers ("currentPhase");
CREATE INDEX IF NOT EXISTS idx_trailers_updated_at ON public.trailers (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_trailers_date_started ON public.trailers ("dateStarted" DESC);
CREATE INDEX IF NOT EXISTS idx_trailers_station_bay_order ON public.trailers (station, bay_vertical_order ASC);

-- 2. Indexes on public.shipped_trailers
CREATE INDEX IF NOT EXISTS idx_shipped_trailers_shipped_at ON public.shipped_trailers (shipped_at DESC);
CREATE INDEX IF NOT EXISTS idx_shipped_trailers_invoice_number ON public.shipped_trailers (invoice_number);

-- 3. Indexes on public.messages
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON public.messages (recipient_type, recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_filter ON public.messages (recipient_type, recipient_id, created_at DESC);

-- 4. Indexes on public.message_reads
CREATE INDEX IF NOT EXISTS idx_message_reads_user_message ON public.message_reads (user_id, message_id);

-- 5. Indexes on public.profiles
CREATE INDEX IF NOT EXISTS idx_profiles_name ON public.profiles (name);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);

-- 6. Indexes on public.chat_groups
CREATE INDEX IF NOT EXISTS idx_chat_groups_name ON public.chat_groups (name);

-- 7. Indexes on public.dealers
CREATE INDEX IF NOT EXISTS idx_dealers_name ON public.dealers (name);

-- 8. Indexes on public.production_models
CREATE INDEX IF NOT EXISTS idx_production_models_name ON public.production_models (name);

-- 9. Indexes on public.quotes_denied
CREATE INDEX IF NOT EXISTS idx_quotes_denied_denied_at ON public.quotes_denied (denied_at DESC);

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
