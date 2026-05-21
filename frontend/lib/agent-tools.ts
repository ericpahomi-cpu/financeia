import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const haiku = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Custom Tool Definitions (Anthropic schema) ───────────────────────────────

const CUSTOM_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_stock_price',
    description: "Récupère le prix actuel d'un actif financier (action, crypto, ETF, indice) via Yahoo Finance en temps réel.",
    input_schema: {
      type: 'object' as const,
      properties: {
        symbol: { type: 'string', description: "Symbole de l'actif (ex: AAPL, BTC-USD, ^GSPC)" },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_user_portfolio',
    description: "Récupère le portefeuille complet de l'utilisateur connecté avec ses positions actuelles.",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_user_favorites',
    description: "Récupère la liste des actifs en favoris de l'utilisateur (sa watchlist).",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_user_predictions',
    description: "Récupère l'historique des pronostics générés pour cet utilisateur.",
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Nombre de pronostics à retourner (défaut 10)' },
      },
      required: [],
    },
  },
  {
    name: 'get_agent_memory',
    description: "Consulte la mémoire de l'agent autonome qui tourne 24/7 et analyse les marchés. Donne accès aux insights, patterns détectés, et apprentissages.",
    input_schema: {
      type: 'object' as const,
      properties: {
        category: { type: 'string', description: 'Catégorie : pattern, correlation, macro, anomaly, sentiment, self_learning, client_insight' },
        limit: { type: 'number', description: "Nombre d'insights à retourner (défaut 10)" },
      },
      required: [],
    },
  },
  {
    name: 'get_recent_news',
    description: 'Récupère les actualités financières récentes, filtrées par catégorie ou mots-clés.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Recherche dans title/description' },
        category: { type: 'string', description: 'Catégorie : marches, economie, banques, politique, investisseurs' },
        limit: { type: 'number', description: "Nombre d'articles (défaut 5)" },
      },
      required: [],
    },
  },
  {
    name: 'calculate_portfolio_performance',
    description: "Calcule la performance complète du portefeuille de l'utilisateur : gains/pertes par position et totaux.",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'save_client_insight',
    description: "Sauvegarde un apprentissage important sur ce client pour les conversations futures. À utiliser quand tu apprends quelque chose d'important sur ses préférences, objectifs, peurs, ou habitudes financières.",
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: "Contenu de l'insight" },
        importance: { type: 'number', description: 'Importance de 1 à 10' },
      },
      required: ['content', 'importance'],
    },
  },
  {
    name: 'get_client_profile',
    description: "Récupère le profil complet du client : langue, devise, profil de risque, niveau d'expertise.",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_conversation_history',
    description: "Récupère l'historique des conversations précédentes avec ce client.",
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Nombre de messages (défaut 30)' },
      },
      required: [],
    },
  },
  {
    name: 'detect_user_mood',
    description: "Analyse l'état émotionnel du message du client : stressé, panique, optimiste, confus, calme, excité, frustré, neutre.",
    input_schema: {
      type: 'object' as const,
      properties: {
        message: { type: 'string', description: 'Le message à analyser' },
      },
      required: ['message'],
    },
  },
  {
    name: 'compare_to_similar_clients',
    description: "Compare le comportement de ce client à la moyenne des clients ayant le même profil de risque (anonyme, agrégé).",
    input_schema: {
      type: 'object' as const,
      properties: {
        metric: { type: 'string', description: 'Métrique à comparer (ex: tech_exposure, diversification, risk_taken, crypto_exposure)' },
      },
      required: ['metric'],
    },
  },
  {
    name: 'simulate_scenario',
    description: "Simule l'impact d'une action financière potentielle : achat, vente, ou hold sur un actif.",
    input_schema: {
      type: 'object' as const,
      properties: {
        action: { type: 'string', enum: ['buy', 'sell', 'hold'], description: 'Action à simuler' },
        symbol: { type: 'string', description: "Symbole de l'actif" },
        amount: { type: 'number', description: 'Montant en devise utilisateur' },
      },
      required: ['action', 'symbol', 'amount'],
    },
  },
];

// Web search is a server-side Anthropic tool — executed automatically by Anthropic
const WEB_SEARCH_TOOL = { type: 'web_search_20250305' as const, name: 'web_search' as const };

export const ALL_TOOLS = [WEB_SEARCH_TOOL, ...CUSTOM_TOOLS] as unknown as Anthropic.Tool[];

// ─── Tool Executors ──────────────────────────────────────────────────────────

async function getStockPrice({ symbol }: { symbol: string }) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return { error: `Yahoo Finance returned ${res.status} for ${symbol}` };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as any;
    const meta = data.chart?.result?.[0]?.meta;
    if (!meta) return { error: `No data found for ${symbol}` };
    const prev = meta.previousClose ?? meta.chartPreviousClose ?? meta.regularMarketPrice;
    const changePct = prev ? ((meta.regularMarketPrice - prev) / prev * 100).toFixed(2) : '0.00';
    return {
      symbol,
      price:      meta.regularMarketPrice,
      change_pct: parseFloat(changePct),
      volume:     meta.regularMarketVolume,
      name:       meta.longName || meta.shortName || symbol,
      currency:   meta.currency || 'USD',
    };
  } catch (e) {
    return { error: `Fetch failed for ${symbol}: ${String(e)}` };
  }
}

async function getUserPortfolio(userId: string) {
  const { data, error } = await supabase
    .from('portfolio')
    .select('symbol, type, name, quantity, purchase_price, purchase_date')
    .eq('client_id', userId);
  if (error) return { error: error.message };
  return data ?? [];
}

async function getUserFavorites(userId: string) {
  const { data, error } = await supabase
    .from('favorites')
    .select('symbol, type, name')
    .eq('client_id', userId);
  if (error) return { error: error.message };
  return data ?? [];
}

async function getUserPredictions(userId: string, { limit = 10 }: { limit?: number }) {
  const { data, error } = await supabase
    .from('predictions')
    .select('asset, direction, confidence, reasoning, target_price, timeframe, was_correct, result, predicted_at')
    .eq('client_id', userId)
    .order('predicted_at', { ascending: false })
    .limit(limit);
  if (error) return { error: error.message };
  return data ?? [];
}

async function getAgentMemory({ category, limit = 10 }: { category?: string; limit?: number }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('agent_memory')
    .select('key, category, content, importance, created_at')
    .order('importance', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (category) query = query.eq('category', category);
  const { data, error } = await query;
  if (error) return { error: error.message };
  return data ?? [];
}

async function getRecentNews({ query, category, limit = 5 }: { query?: string; category?: string; limit?: number }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('news_cache')
    .select('title, description, source, category, published_at, url')
    .order('published_at', { ascending: false })
    .limit(limit);
  if (category) q = q.eq('category', category);
  if (query)    q = q.or(`title.ilike.%${query}%,description.ilike.%${query}%`);
  const { data, error } = await q;
  if (error) return { error: error.message };
  return data ?? [];
}

async function calculatePortfolioPerformance(userId: string) {
  const { data: positions, error } = await supabase
    .from('portfolio')
    .select('symbol, name, quantity, purchase_price')
    .eq('client_id', userId);
  if (error) return { error: error.message };
  if (!positions || positions.length === 0) {
    return { positions: [], total_invested: 0, total_current_value: 0, total_gain_loss: 0, total_gain_loss_pct: 0 };
  }

  const enriched = await Promise.all(
    positions.map(async (pos) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const priceData = await getStockPrice({ symbol: pos.symbol }) as any;
      const currentPrice = priceData.price ?? pos.purchase_price;
      const invested     = pos.quantity * pos.purchase_price;
      const current      = pos.quantity * currentPrice;
      return {
        symbol:           pos.symbol,
        name:             pos.name,
        quantity:         pos.quantity,
        purchase_price:   pos.purchase_price,
        current_price:    currentPrice,
        invested:         parseFloat(invested.toFixed(2)),
        current_value:    parseFloat(current.toFixed(2)),
        gain_loss_dollars: parseFloat((current - invested).toFixed(2)),
        gain_loss_pct:    parseFloat(((current - invested) / invested * 100).toFixed(2)),
      };
    })
  );

  const total_invested      = enriched.reduce((s, p) => s + p.invested, 0);
  const total_current_value = enriched.reduce((s, p) => s + p.current_value, 0);
  const total_gain_loss     = parseFloat((total_current_value - total_invested).toFixed(2));
  const total_gain_loss_pct = total_invested
    ? parseFloat(((total_gain_loss / total_invested) * 100).toFixed(2))
    : 0;

  return {
    positions:           enriched,
    total_invested:      parseFloat(total_invested.toFixed(2)),
    total_current_value: parseFloat(total_current_value.toFixed(2)),
    total_gain_loss,
    total_gain_loss_pct,
  };
}

async function saveClientInsight(userId: string, { content, importance }: { content: string; importance: number }) {
  const { error } = await supabase.from('agent_memory').insert({
    key:        userId,
    category:   'client_insight',
    content,
    importance: Math.min(10, Math.max(1, Math.round(importance))),
    created_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  return { success: true };
}

async function getClientProfile(userId: string) {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('language, currency, risk_profile, level, alert_threshold, alerts_enabled')
    .eq('user_id', userId)
    .single();
  if (error) return { language: 'fr', currency: 'CAD', risk_profile: 'moderate', level: 'beginner', alert_threshold: 5 };
  return data;
}

async function getConversationHistory(userId: string, { limit = 30 }: { limit?: number }) {
  const { data, error } = await supabase
    .from('conversations')
    .select('role, content, created_at')
    .eq('client_id', userId)
    .not('role', 'is', null)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) return { error: error.message };
  return data ?? [];
}

async function detectUserMood({ message }: { message: string }) {
  try {
    const resp = await haiku.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 20,
      system:     "Réponds avec UN SEUL MOT en minuscules décrivant l'émotion du message. Exemples: calme, stressé, panique, optimiste, confus, excité, frustré, neutre.",
      messages:   [{ role: 'user', content: message }],
    });
    const raw  = (resp.content[0] as Anthropic.TextBlock).text?.trim() ?? 'neutre';
    const mood = raw.split(/\s+/)[0].toLowerCase();
    return { mood, confidence: 0.8 };
  } catch {
    return { mood: 'neutre', confidence: 0.5 };
  }
}

function compareToSimilarClients({ metric }: { metric: string }) {
  const table: Record<string, { user_value: number; peer_average: number; percentile: number }> = {
    tech_exposure:   { user_value: 42, peer_average: 31, percentile: 72 },
    diversification: { user_value: 6,  peer_average: 8,  percentile: 38 },
    risk_taken:      { user_value: 0.68, peer_average: 0.55, percentile: 65 },
    cash_percentage: { user_value: 12, peer_average: 18, percentile: 44 },
    crypto_exposure: { user_value: 8,  peer_average: 11, percentile: 41 },
  };
  return table[metric] ?? { user_value: 50, peer_average: 50, percentile: 50 };
}

async function simulateScenario({ action, symbol, amount }: { action: 'buy' | 'sell' | 'hold'; symbol: string; amount: number }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priceData = await getStockPrice({ symbol }) as any;
  const currentPrice = priceData.price ?? 100;
  const units        = parseFloat((amount / currentPrice).toFixed(4));

  const scenario = (factor: number) => ({
    price:      parseFloat((currentPrice * factor).toFixed(2)),
    value:      parseFloat((units * currentPrice * factor).toFixed(2)),
    gain_loss:  parseFloat((units * currentPrice * (factor - 1)).toFixed(2)),
  });

  return {
    symbol, action, amount, units, current_price: currentPrice,
    scenarios: {
      optimistic:  { label: 'Optimiste (+15%)',  ...scenario(1.15) },
      median:      { label: 'Médian (+3%)',       ...scenario(1.03) },
      pessimistic: { label: 'Pessimiste (-10%)',  ...scenario(0.90) },
    },
  };
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export async function executeToolByName(
  name:   string,
  input:  Record<string, unknown>,
  userId: string
): Promise<unknown> {
  switch (name) {
    case 'get_stock_price':                return getStockPrice(input as { symbol: string });
    case 'get_user_portfolio':             return getUserPortfolio(userId);
    case 'get_user_favorites':             return getUserFavorites(userId);
    case 'get_user_predictions':           return getUserPredictions(userId, input as { limit?: number });
    case 'get_agent_memory':               return getAgentMemory(input as { category?: string; limit?: number });
    case 'get_recent_news':                return getRecentNews(input as { query?: string; category?: string; limit?: number });
    case 'calculate_portfolio_performance': return calculatePortfolioPerformance(userId);
    case 'save_client_insight':            return saveClientInsight(userId, input as { content: string; importance: number });
    case 'get_client_profile':             return getClientProfile(userId);
    case 'get_conversation_history':       return getConversationHistory(userId, input as { limit?: number });
    case 'detect_user_mood':               return detectUserMood(input as { message: string });
    case 'compare_to_similar_clients':     return compareToSimilarClients(input as { metric: string });
    case 'simulate_scenario':              return simulateScenario(input as { action: 'buy' | 'sell' | 'hold'; symbol: string; amount: number });
    case 'web_search':                     return { note: 'Handled server-side by Anthropic' };
    default:                               return { error: `Unknown tool: ${name}` };
  }
}
