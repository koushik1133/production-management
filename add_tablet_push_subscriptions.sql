-- Create tablet_push_subscriptions table to store Web Push endpoints for screen-off alarms
CREATE TABLE IF NOT EXISTS tablet_push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tablet_slot TEXT NOT NULL UNIQUE, -- 'T1', 'T2', 'T3', 'manager'
    user_id TEXT,
    subscription JSONB NOT NULL,
    user_agent TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE tablet_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow public/anon reads and writes so shop floor tablets can register their push endpoint
CREATE POLICY "Allow public read tablet_push_subscriptions"
    ON tablet_push_subscriptions FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "Allow public insert/update tablet_push_subscriptions"
    ON tablet_push_subscriptions FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);
