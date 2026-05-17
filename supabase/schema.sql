-- FinanceAI — SQL à exécuter dans le dashboard Supabase

-- Conversations (si pas encore créé)
CREATE TABLE IF NOT EXISTS conversations (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id   UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conv_client ON conversations(client_id, created_at ASC);

-- Favoris (stocks + crypto)
CREATE TABLE IF NOT EXISTS favorites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  symbol      TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('stock', 'crypto')),
  name        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, symbol)
);

-- Préférences utilisateur
CREATE TABLE IF NOT EXISTS user_settings (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  currency        TEXT DEFAULT 'CAD',
  language        TEXT DEFAULT 'fr',
  risk_profile    TEXT DEFAULT 'moderate',
  level           TEXT DEFAULT 'beginner',
  alert_threshold DECIMAL DEFAULT 5.0,
  alerts_enabled  BOOLEAN DEFAULT TRUE,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Portefeuille
CREATE TABLE IF NOT EXISTS portfolio (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  symbol         TEXT NOT NULL,
  type           TEXT DEFAULT 'stock',
  name           TEXT,
  quantity       DECIMAL NOT NULL DEFAULT 0,
  purchase_price DECIMAL NOT NULL DEFAULT 0,
  purchase_date  DATE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, symbol)
);

-- Pronostics de l'agent
CREATE TABLE IF NOT EXISTS predictions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID REFERENCES auth.users(id),
  asset        TEXT NOT NULL,
  direction    TEXT NOT NULL CHECK (direction IN ('hausse', 'baisse', 'neutre')),
  confidence   INTEGER CHECK (confidence BETWEEN 0 AND 100),
  reasoning    TEXT,
  predicted_at TIMESTAMPTZ DEFAULT NOW(),
  result       TEXT,
  was_correct  BOOLEAN,
  resolved_at  TIMESTAMPTZ
);

-- Mémoire globale de l'agent
CREATE TABLE IF NOT EXISTS agent_memory (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content     TEXT NOT NULL,
  importance  INTEGER DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  category    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE favorites     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio     ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_favorites"     ON favorites     FOR ALL USING (auth.uid() = client_id);
CREATE POLICY "own_settings"      ON user_settings FOR ALL USING (auth.uid() = id);
CREATE POLICY "own_portfolio"     ON portfolio     FOR ALL USING (auth.uid() = client_id);
CREATE POLICY "own_conversations" ON conversations FOR ALL USING (auth.uid() = client_id);
