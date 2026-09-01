-- Ensure all tables are part of supabase_realtime publication
DO $$
BEGIN
  -- trailers
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'trailers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trailers;
  END IF;

  -- bay_settings
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bay_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bay_settings;
  END IF;

  -- production_models
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'production_models'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.production_models;
  END IF;

  -- dealers
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'dealers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dealers;
  END IF;

  -- shipped_trailers
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'shipped_trailers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shipped_trailers;
  END IF;

  -- chat_groups
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_groups'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_groups;
  END IF;

  -- messages
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Realtime publication setup completed or skipped: %', SQLERRM;
END $$;
