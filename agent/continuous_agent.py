"""
FinanceAI — Agent Autonome & Intelligent
Claude analyse les marchés et prend ses propres décisions.
Pas de seuils hardcodés — mémoire persistante, auto-amélioration.
"""
import os, json, re, time, logging, datetime
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime as rss_parse_date
from zoneinfo import ZoneInfo
import schedule
import anthropic
import requests
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger(__name__)

ANTHROPIC_CLIENT = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))
SUPABASE  = create_client(os.getenv('SUPABASE_URL', ''), os.getenv('SUPABASE_SERVICE_ROLE_KEY', ''))
EST = ZoneInfo('America/New_York')
UA  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

# Global indicators always included in every scan for macro context
GLOBAL_INDICATORS = ['SPY', 'QQQ', 'BTC-USD', 'ETH-USD', '^VIX', 'GLD']

# ─── Yahoo Finance — session with crumb auth ──────────────────────────────────

_yf = requests.Session()
_yf.headers.update({'User-Agent': UA})
_crumb: str | None = None
_crumb_exp: float  = 0.0


def is_market_open() -> bool:
    now = datetime.datetime.now(EST)
    if now.weekday() >= 5:
        return False
    t = now.time()
    return datetime.time(9, 30) <= t <= datetime.time(16, 0)


def get_crumb() -> str | None:
    global _crumb, _crumb_exp
    now = time.time()
    if _crumb and now < _crumb_exp:
        return _crumb
    try:
        _yf.get('https://fc.yahoo.com', timeout=10)          # sets session cookies
        r = _yf.get('https://query1.finance.yahoo.com/v1/test/getcrumb', timeout=10)
        if r.ok and r.text.strip():
            _crumb     = r.text.strip()
            _crumb_exp = now + 55 * 60
            log.info('Yahoo crumb OK: %s…', _crumb[:6])
            return _crumb
    except Exception as e:
        log.warning('Crumb error: %s', e)
    return None


def get_prices_batch(symbols: list[str]) -> list[dict]:
    """Batch price fetch via v7 (crumb) → falls back to v8 per-symbol."""
    if not symbols:
        return []
    crumb = get_crumb()
    if crumb:
        try:
            url = (
                'https://query1.finance.yahoo.com/v7/finance/quote'
                f'?symbols={requests.utils.quote(",".join(symbols))}'
                f'&formatted=false&crumb={requests.utils.quote(crumb)}'
            )
            r = _yf.get(url, timeout=15)
            if r.ok:
                results = r.json().get('quoteResponse', {}).get('result', [])
                if results:
                    return [_quote_to_dict(q) for q in results]
        except Exception as e:
            log.warning('v7 batch error: %s', e)

    # Fallback: parallel v8
    out = []
    for sym in symbols:
        d = get_price_v8(sym)
        if d:
            out.append(d)
    return out


def _quote_to_dict(q: dict) -> dict:
    return {
        'symbol':     q['symbol'],
        'name':       q.get('shortName') or q.get('longName') or q['symbol'],
        'price':      q.get('regularMarketPrice', 0),
        'change_pct': q.get('regularMarketChangePercent', 0),
        'volume':     q.get('regularMarketVolume', 0),
    }


def get_price_v8(symbol: str) -> dict | None:
    try:
        url = (
            f'https://query1.finance.yahoo.com/v8/finance/chart/{requests.utils.quote(symbol)}'
            '?interval=1d&range=2d&includePrePost=false'
        )
        r = _yf.get(url, timeout=10)
        if not r.ok:
            return None
        meta  = r.json().get('chart', {}).get('result', [{}])[0].get('meta', {})
        price = meta.get('regularMarketPrice', 0)
        prev  = meta.get('chartPreviousClose') or meta.get('previousClose') or 0
        pct   = ((price - prev) / prev * 100) if prev else 0
        return {
            'symbol':     meta.get('symbol', symbol),
            'name':       meta.get('shortName') or symbol,
            'price':      price,
            'change_pct': pct,
            'volume':     meta.get('regularMarketVolume', 0),
        }
    except Exception as e:
        log.warning('v8 %s: %s', symbol, e)
        return None


# ─── Supabase helpers ─────────────────────────────────────────────────────────

def get_all_user_ids() -> list[str]:
    """All user IDs that have at least one saved favorite."""
    try:
        res = SUPABASE.from_('favorites').select('client_id').execute()
        return list(set(f['client_id'] for f in (res.data or []) if f.get('client_id')))
    except Exception as e:
        log.error('get_all_user_ids: %s', e)
        return []


def get_user_email(user_id: str) -> str:
    try:
        res = SUPABASE.auth.admin.get_user_by_id(user_id)
        return res.user.email or ''
    except Exception:
        return ''


def get_client_favorites(client_id: str) -> list[dict]:
    try:
        res = SUPABASE.from_('favorites').select('symbol, type, name').eq('client_id', client_id).execute()
        return res.data or []
    except Exception:
        return []


def save_alert(client_id: str, asset: str, message: str, alert_type: str = 'ai_insight'):
    try:
        SUPABASE.from_('alerts').insert({
            'client_id': client_id,
            'type':      alert_type,
            'asset':     asset,
            'message':   message,
            'is_read':   False,
        }).execute()
    except Exception as e:
        log.error('save_alert: %s', e)


def send_alert_email(to_email: str, subject: str, body: str):
    try:
        import resend
        resend.api_key = os.getenv('RESEND_API_KEY', '')
        resend.Emails.send({
            'from': f"{os.getenv('FROM_NAME','FinanceAI')} <{os.getenv('FROM_EMAIL','onboarding@resend.dev')}>",
            'to':   [to_email],
            'subject': subject,
            'html': f'<div style="font-family:Arial;max-width:600px;margin:auto;padding:20px"><p>{body}</p></div>',
        })
        log.info('Email → %s', to_email)
    except Exception as e:
        log.error('Email error: %s', e)


def save_memory(content: str, category: str, importance: int = 5):
    try:
        SUPABASE.from_('agent_memory').insert({
            'content':    content,
            'category':   category,
            'importance': max(1, min(10, importance)),
        }).execute()
    except Exception as e:
        log.error('save_memory: %s', e)


def load_contextual_memory() -> str:
    """
    Load a curated mix of memories:
    - Recent observations (last 6 h)
    - High-importance historical insights (importance ≥ 7)
    """
    try:
        six_h_ago = (
            datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=6)
        ).isoformat()

        recent = (
            SUPABASE.from_('agent_memory')
            .select('content, category, importance')
            .gte('created_at', six_h_ago)
            .order('importance', desc=True)
            .limit(15)
            .execute()
        )
        historical = (
            SUPABASE.from_('agent_memory')
            .select('content, category, importance')
            .gte('importance', 7)
            .lt('created_at', six_h_ago)
            .order('created_at', desc=True)
            .limit(15)
            .execute()
        )
        all_mems = (recent.data or []) + (historical.data or [])
        if not all_mems:
            return 'Aucune mémoire disponible.'
        return '\n'.join(
            f"  [{m['category']}|{m['importance']}] {m['content']}"
            for m in all_mems
        )
    except Exception as e:
        log.error('load_contextual_memory: %s', e)
        return ''


def save_prediction(client_id: str | None, asset: str, direction: str,
                    confidence: int, reasoning: str):
    try:
        SUPABASE.from_('predictions').insert({
            'client_id':  client_id,
            'asset':      asset,
            'direction':  direction,
            'confidence': confidence,
            'reasoning':  reasoning,
        }).execute()
    except Exception as e:
        log.error('save_prediction: %s', e)


def parse_json(text: str) -> dict:
    """Parse Claude's JSON, stripping accidental markdown fences."""
    text = re.sub(r'^```(?:json)?\s*', '', text.strip(), flags=re.MULTILINE)
    text = re.sub(r'\s*```$',          '', text.strip(), flags=re.MULTILINE)
    return json.loads(text.strip())


# ─── Core intelligence ────────────────────────────────────────────────────────

def autonomous_market_scan():
    """
    Every 15 min — Claude analyses all market data autonomously.
    No hardcoded thresholds: Claude decides what is significant,
    who to alert, and what patterns to memorise.
    """
    log.info('▶ Autonomous market scan...')

    # 1. Collect all symbols: global indicators + every user's favourites
    user_ids = get_all_user_ids()
    all_symbols: set[str] = set(GLOBAL_INDICATORS)
    user_portfolios: dict[str, list[dict]] = {}

    for uid in user_ids:
        favs = get_client_favorites(uid)
        if favs:
            user_portfolios[uid] = favs
            all_symbols.update(f['symbol'] for f in favs)

    # 2. Fetch prices in one batch
    prices = get_prices_batch(list(all_symbols))
    if not prices:
        log.warning('No price data — skipping scan.')
        return

    # 3. Format market snapshot (sorted by absolute move for salience)
    market_str = '\n'.join(
        f"  {p['symbol']:12} {p['name'][:22]:22} ${p['price']:>10.2f}  {p['change_pct']:+7.2f}%"
        + (f"  vol:{p['volume']/1e6:.0f}M" if p.get('volume') else '')
        for p in sorted(prices, key=lambda x: abs(x['change_pct']), reverse=True)
    )

    # 4. Load agent memory for context
    memory_str = load_contextual_memory()

    # 5. Build user watchlist context (abbreviated user IDs for privacy)
    user_ctx = '\n'.join(
        f"  uid:{uid[:8]}… → " + ', '.join(
            f"{f['symbol']}({f['type'][0].upper()})" for f in favs[:8]
        )
        for uid, favs in user_portfolios.items()
    ) or '  Aucun utilisateur avec favoris.'

    now_str = datetime.datetime.now(EST).strftime('%A %d %b %Y %H:%M EST')
    status  = 'OUVERT' if is_market_open() else 'FERMÉ'

    prompt = f"""Tu es l'agent de surveillance autonome d'une plateforme FinanceAI.

DATE/HEURE : {now_str} — Marché : {status}

DONNÉES DE MARCHÉ (triées par amplitude de mouvement) :
{market_str}

TES MÉMOIRES RÉCENTES (observations précédentes et insights) :
{memory_str}

WATCHLISTS UTILISATEURS :
{user_ctx}

Analyse de manière TOTALEMENT AUTONOME. Tu n'as aucun seuil fixe à respecter.
Utilise ton jugement pour :
1. Identifier les mouvements, divergences ou anomalies vraiment significatifs
2. Détecter des corrélations cross-actifs (ex: VIX monte + SPY baisse ensemble)
3. Décider qui mérite une alerte personnalisée et rédiger le message
4. Choisir les insights à mémoriser pour affiner tes prochaines analyses
5. Évaluer le sentiment global du marché

Réponds UNIQUEMENT avec ce JSON valide — sans texte avant ou après :
{{
  "market_mood": "bullish|bearish|neutral|volatile|mixed",
  "observations": [
    "observation concise sur un mouvement ou pattern notable"
  ],
  "correlations_detected": [
    "corrélation ou pattern cross-actifs détecté"
  ],
  "alerts": [
    {{
      "user_id": "uid_complet_exact_ici",
      "asset": "SYMBOLE",
      "message": "Message d'alerte clair et utile pour l'utilisateur",
      "importance": 8,
      "reasoning": "pourquoi tu juges ça important pour cet utilisateur"
    }}
  ],
  "memories_to_save": [
    {{
      "content": "insight précis à retenir pour les prochaines analyses",
      "category": "pattern|correlation|macro|anomaly|sentiment",
      "importance": 7
    }}
  ]
}}"""

    try:
        resp = ANTHROPIC_CLIENT.messages.create(
            model='claude-sonnet-4-6',
            max_tokens=2000,
            system='Tu es un analyste quantitatif expert. Réponds UNIQUEMENT en JSON valide.',
            messages=[{'role': 'user', 'content': prompt}],
        )
        data = parse_json(resp.content[0].text)
    except Exception as e:
        log.error('Claude scan error: %s', e)
        return

    # Save memories Claude decided are worth keeping
    for mem in data.get('memories_to_save', []):
        save_memory(mem['content'], mem['category'], mem.get('importance', 5))

    # Execute personalised alerts
    alerts_sent = 0
    for alert in data.get('alerts', []):
        uid = alert.get('user_id', '')
        if not uid or uid not in user_portfolios:
            continue
        email = get_user_email(uid)
        asset = alert.get('asset', 'MARKET')
        msg   = alert['message']
        save_alert(uid, asset, msg, 'ai_insight')
        if email:
            send_alert_email(email, f"🤖 FinanceAI — {asset}", msg)
        alerts_sent += 1
        log.info('Alert uid:%s… %s — %s', uid[:8], asset, msg[:80])

    log.info(
        '✓ Scan: mood=%s  obs=%d  corr=%d  alerts=%d  memories=%d',
        data.get('market_mood', '?'),
        len(data.get('observations', [])),
        len(data.get('correlations_detected', [])),
        alerts_sent,
        len(data.get('memories_to_save', [])),
    )


def deep_nightly_analysis():
    """
    Daily at 22:00 — Deep autonomous analysis.
    Claude evaluates its own past predictions, detects long-term patterns,
    refines its market thesis, and generates calibrated new predictions.
    """
    log.info('▶ Deep nightly analysis...')

    # Load extended memories (48 h)
    try:
        cutoff = (
            datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=48)
        ).isoformat()
        mems = (
            SUPABASE.from_('agent_memory')
            .select('content, category, importance, created_at')
            .gte('created_at', cutoff)
            .order('importance', desc=True)
            .limit(50)
            .execute()
        ).data or []
    except Exception as e:
        log.error('Memory load: %s', e)
        mems = []

    # Load past predictions + outcomes (for self-assessment)
    try:
        preds = (
            SUPABASE.from_('predictions')
            .select('asset, direction, confidence, reasoning, was_correct, result')
            .not_.is_('was_correct', 'null')
            .order('predicted_at', desc=True)
            .limit(20)
            .execute()
        ).data or []
    except Exception:
        preds = []

    correct  = sum(1 for p in preds if p.get('was_correct'))
    total    = len(preds)
    accuracy = f"{correct}/{total} ({100*correct//total if total else 0}%)" if total else "Aucune prédiction résolue"

    # Load recent news headlines for macro context
    try:
        news = (
            SUPABASE.from_('news_cache')
            .select('title, source, category')
            .order('fetched_at', desc=True)
            .limit(20)
            .execute()
        ).data or []
        news_str = '\n'.join(f"  [{n['category']}] {n['title']} ({n['source']})" for n in news)
    except Exception:
        news_str = 'Non disponible'

    memory_str = '\n'.join(
        f"  [{m['category']}|{m['importance']}] {m['content']}" for m in mems
    )
    pred_str = '\n'.join(
        f"  {p['asset']}: {p['direction']} ({p['confidence']}%) "
        f"→ {p.get('result','?')} {'✓' if p.get('was_correct') else '✗'}"
        for p in preds
    ) or '  Aucune prédiction résolue.'

    prompt = f"""Tu es un hedge fund quantitatif qui effectue son bilan nocturne.

TES PERFORMANCES — {accuracy} :
{pred_str}

TES OBSERVATIONS DES 48 DERNIÈRES HEURES :
{memory_str}

ACTUALITÉS RÉCENTES :
{news_str}

Effectue une analyse profonde et autocritique :
1. Identifie honnêtement tes biais et erreurs récurrentes dans tes prédictions
2. Détecte des patterns émergents cross-actifs sur 48 h
3. Formule une thèse macro pour les prochaines 24 h
4. Génère des prédictions nouvelles, calibrées sur tes vraies performances passées
5. Sélectionne les insights les plus importants à conserver en mémoire long-terme

Réponds UNIQUEMENT avec ce JSON valide — sans texte avant ou après :
{{
  "self_assessment": "évaluation honnête et critique de tes performances et biais",
  "market_thesis": "thèse macro principale pour les prochaines 24 h (2-3 phrases max)",
  "patterns_detected": [
    "pattern cross-actifs ou macro observé sur 48 h"
  ],
  "key_insights": [
    {{
      "content": "insight important à conserver",
      "category": "self_learning|pattern|macro|correlation|risk",
      "importance": 8
    }}
  ],
  "predictions": [
    {{
      "asset": "SYMBOLE",
      "direction": "hausse|baisse|neutre",
      "confidence": 65,
      "reasoning": "raisonnement factuel basé sur les données observées"
    }}
  ]
}}"""

    try:
        resp = ANTHROPIC_CLIENT.messages.create(
            model='claude-sonnet-4-6',
            max_tokens=2500,
            system='Tu es un analyste quantitatif expert. Réponds UNIQUEMENT en JSON valide.',
            messages=[{'role': 'user', 'content': prompt}],
        )
        data = parse_json(resp.content[0].text)
    except Exception as e:
        log.error('Nightly analysis error: %s', e)
        return

    # Persist high-value memories
    if data.get('self_assessment'):
        save_memory(data['self_assessment'], 'self_learning', importance=9)
    if data.get('market_thesis'):
        save_memory(data['market_thesis'], 'thesis', importance=9)
    for p in data.get('patterns_detected', []):
        save_memory(p, 'pattern', importance=7)
    for ins in data.get('key_insights', []):
        save_memory(ins['content'], ins['category'], ins.get('importance', 6))

    # Save new predictions
    for pred in data.get('predictions', []):
        save_prediction(None, pred['asset'], pred['direction'],
                        pred['confidence'], pred['reasoning'])

    log.info(
        '✓ Nightly: %d insights, %d predictions',
        len(data.get('key_insights', [])) + len(data.get('patterns_detected', [])),
        len(data.get('predictions', [])),
    )


def resolve_predictions():
    """
    Daily at 22:30 — Compare yesterday's predictions against real outcomes.
    Saves each result to memory so the agent can learn from its mistakes.
    """
    yesterday = (datetime.datetime.now() - datetime.timedelta(days=1)).isoformat()
    try:
        res = (
            SUPABASE.from_('predictions')
            .select('id, asset, direction, confidence')
            .gte('predicted_at', yesterday)
            .is_('was_correct', 'null')
            .execute()
        )
        for pred in (res.data or []):
            price_data = get_price_v8(pred['asset'])
            if not price_data:
                continue
            pct    = price_data['change_pct']
            actual = 'hausse' if pct > 1.0 else 'baisse' if pct < -1.0 else 'neutre'
            correct = actual == pred['direction']

            SUPABASE.from_('predictions').update({
                'result':      f"{pct:+.2f}%",
                'was_correct': correct,
                'resolved_at': datetime.datetime.now().isoformat(),
            }).eq('id', pred['id']).execute()

            log.info('Resolved %s: %s → %s (%+.2f%%) %s',
                     pred['asset'], pred['direction'], actual, pct,
                     '✓' if correct else '✗')

            # Save outcome to memory — agent learns from every error
            note = (
                f"Prédiction {pred['asset']}: {pred['direction']} → réel {actual} ({pct:+.2f}%). "
                f"{'Correcte' if correct else 'INCORRECTE'} — confiance était {pred['confidence']}%."
            )
            # Wrong predictions are more important to remember (importance 8 vs 5)
            save_memory(note, 'prediction_outcome', importance=8 if not correct else 5)

    except Exception as e:
        log.error('resolve_predictions: %s', e)


# ─── Data collection ──────────────────────────────────────────────────────────

# Trusted financial RSS feeds — no API key required
RSS_FEEDS = [
    ('Yahoo Finance',  'https://finance.yahoo.com/news/rssindex'),
    ('CNBC Markets',   'https://www.cnbc.com/id/100003114/device/rss/rss.html'),
    ('MarketWatch',    'https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines'),
    ('Reuters Biz',    'https://feeds.reuters.com/reuters/businessNews'),
    ('Reuters Mkts',   'https://feeds.reuters.com/reuters/markets'),
    ('Seeking Alpha',  'https://seekingalpha.com/market-news/all.xml'),
]

# NewsAPI — restricted to trusted financial domains only (no cricket, no sport)
FINANCIAL_DOMAINS = (
    'reuters.com,cnbc.com,marketwatch.com,bloomberg.com,wsj.com,'
    'ft.com,seekingalpha.com,thestreet.com,barrons.com,'
    'businessinsider.com,forbes.com,investopedia.com,benzinga.com'
)


def _parse_rss_date(date_str: str) -> str | None:
    """Parse RFC 2822 (RSS pubDate) or ISO 8601 → ISO string."""
    if not date_str:
        return None
    try:
        return rss_parse_date(date_str).isoformat()
    except Exception:
        try:
            return datetime.datetime.fromisoformat(
                date_str.replace('Z', '+00:00')
            ).isoformat()
        except Exception:
            return None


def fetch_rss_feed(source_name: str, url: str, limit: int = 15) -> list[dict]:
    """Fetch and parse an RSS 2.0 / Atom feed."""
    try:
        r = _yf.get(url, timeout=12)
        if not r.ok:
            log.warning('RSS %s → %s', source_name, r.status_code)
            return []
        root = ET.fromstring(r.content)

        # RSS 2.0
        items = root.findall('.//item')
        # Atom fallback
        if not items:
            items = root.findall('.//{http://www.w3.org/2005/Atom}entry')

        out = []
        for item in items[:limit]:
            A = '{http://www.w3.org/2005/Atom}'
            title = (item.findtext('title') or item.findtext(f'{A}title') or '').strip()
            desc  = (item.findtext('description') or item.findtext('summary')
                     or item.findtext(f'{A}summary') or '').strip()
            link  = (item.findtext('link') or item.findtext(f'{A}id') or '').strip()
            pub   = (item.findtext('pubDate') or item.findtext(f'{A}updated') or '').strip()

            # Strip HTML tags from description
            desc = re.sub(r'<[^>]+>', ' ', desc).strip()[:600]

            if title and link:
                out.append({
                    'title':        title,
                    'description':  desc,
                    'url':          link,
                    'source':       source_name,
                    'published_at': _parse_rss_date(pub),
                    'image':        '',
                })
        return out
    except Exception as e:
        log.warning('RSS %s: %s', source_name, e)
        return []


def fetch_newsapi_finance(api_key: str, limit: int = 30) -> list[dict]:
    """NewsAPI restricted to trusted financial domains — avoids off-topic content."""
    try:
        url = (
            'https://newsapi.org/v2/everything'
            f'?domains={FINANCIAL_DOMAINS}'
            '&q=market OR stocks OR Fed OR inflation OR earnings OR economy OR crypto OR rates'
            '&language=en&sortBy=publishedAt'
            f'&pageSize={limit}&apiKey={api_key}'
        )
        r = requests.get(url, timeout=15)
        if not r.ok:
            log.warning('NewsAPI → %s', r.status_code)
            return []
        return [
            {
                'title':        a['title'],
                'description':  (a.get('description') or '')[:600],
                'url':          a.get('url', ''),
                'source':       a.get('source', {}).get('name', ''),
                'published_at': a.get('publishedAt'),
                'image':        a.get('urlToImage', ''),
            }
            for a in r.json().get('articles', [])
            if a.get('title') and a['title'] != '[Removed]' and a.get('url')
        ]
    except Exception as e:
        log.error('NewsAPI fetch: %s', e)
        return []


def claude_classify_articles(articles: list[dict]) -> list[dict]:
    """
    Send a batch of articles to Claude.
    Claude decides relevance and assigns a financial category.
    Returns only the relevant ones, enriched with 'category'.
    """
    if not articles:
        return []

    numbered = '\n\n'.join(
        f"{i+1}. [{a['source']}] {a['title']}\n   {a['description'][:200]}"
        for i, a in enumerate(articles)
    )

    prompt = f"""Tu es un filtre d'actualités financières. Évalue ces articles.

CRITÈRES D'INCLUSION (au moins un) :
- Décisions de banques centrales (Fed, BCE, BdC, BoJ) ou données macro clés
- Résultats trimestriels, guidance, profit warning d'entreprises cotées
- Fusions, acquisitions, OPA, introductions en bourse
- Données économiques : inflation, PIB, emploi, PMI, ventes au détail
- Crises géopolitiques majeures impactant les marchés
- Mouvements significatifs d'actions, crypto, matières premières, obligations
- Annonces réglementaires majeures (SEC, AMF, CFTC)
- Politique commerciale, tarifs douaniers affectant les marchés

REJETER si : sport, divertissement, politique locale, faits divers, santé non-financière.

CATÉGORIES :
- "marches"   : actions, crypto, ETF, matières premières, earnings, M&A
- "economie"  : PIB, inflation, emploi, PMI, données macro
- "banques"   : Fed, BCE, BdC, BoJ, taux directeurs, politique monétaire
- "politique" : tarifs, réglementation, géopolitique impactant les marchés

ARTICLES :
{numbered}

Réponds UNIQUEMENT avec ce JSON valide :
{{
  "results": [
    {{"index": 1, "relevant": true,  "category": "marches",  "importance": 8}},
    {{"index": 2, "relevant": false}},
    {{"index": 3, "relevant": true,  "category": "banques",  "importance": 9}}
  ]
}}"""

    try:
        resp = ANTHROPIC_CLIENT.messages.create(
            model='claude-haiku-4-5',
            max_tokens=1200,
            system='Tu es un filtre de contenu financier. Réponds UNIQUEMENT en JSON valide.',
            messages=[{'role': 'user', 'content': prompt}],
        )
        data     = parse_json(resp.content[0].text)
        res_map  = {r['index']: r for r in data.get('results', [])}
        filtered = []
        for i, article in enumerate(articles):
            r = res_map.get(i + 1, {})
            if r.get('relevant'):
                article['category']   = r.get('category', 'marches')
                article['importance'] = r.get('importance', 5)
                filtered.append(article)
        return filtered
    except Exception as e:
        log.error('Claude classify: %s', e)
        return []


def refresh_news_cache():
    """
    Every 30 min — collect from trusted financial RSS feeds + NewsAPI,
    filter with Claude for market relevance, store in news_cache.
    Articles that can't impact financial markets are rejected entirely.
    """
    log.info('▶ Refreshing news cache...')
    NEWS_API_KEY = os.getenv('NEWS_API_KEY', '')

    # 1. Collect raw articles from all sources
    raw: list[dict] = []
    for name, feed_url in RSS_FEEDS:
        batch = fetch_rss_feed(name, feed_url)
        raw.extend(batch)
        if batch:
            log.info('  RSS %-18s %d articles', name, len(batch))

    if NEWS_API_KEY:
        api_batch = fetch_newsapi_finance(NEWS_API_KEY)
        raw.extend(api_batch)
        log.info('  NewsAPI              %d articles', len(api_batch))
    else:
        log.warning('  NEWS_API_KEY not set — using RSS feeds only')

    # 2. Deduplicate by URL
    seen: set[str] = set()
    unique: list[dict] = []
    for a in raw:
        if a.get('url') and a['url'] not in seen:
            seen.add(a['url'])
            unique.append(a)

    if not unique:
        log.warning('No articles collected — check feed availability.')
        return

    # 3. Skip URLs already cached (last 6 h) to avoid duplicates
    try:
        cutoff = (
            datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=6)
        ).isoformat()
        existing = SUPABASE.from_('news_cache').select('url').gte('fetched_at', cutoff).execute()
        cached_urls = {r['url'] for r in (existing.data or [])}
        to_classify = [a for a in unique if a['url'] not in cached_urls]
    except Exception:
        to_classify = unique

    if not to_classify:
        log.info('All articles already cached — nothing new.')
        return

    log.info('  Classifying %d new articles via Claude…', len(to_classify))

    # 4. Claude filters & classifies in batches of 25
    relevant: list[dict] = []
    for i in range(0, len(to_classify), 25):
        batch    = to_classify[i:i + 25]
        filtered = claude_classify_articles(batch)
        relevant.extend(filtered)
        if i + 25 < len(to_classify):
            time.sleep(1)   # brief pause between batches

    if not relevant:
        log.warning('No financially relevant articles found this cycle.')
        return

    # 5. Insert into Supabase
    rows = [
        {
            'category':    a['category'],
            'title':       a['title'],
            'description': a.get('description', ''),
            'url':         a['url'],
            'source':      a['source'],
            'published_at': a.get('published_at'),
            'image':       a.get('image', ''),
        }
        for a in relevant
    ]
    try:
        SUPABASE.from_('news_cache').insert(rows).execute()
        sources = len({a['source'] for a in relevant})
        log.info(
            '✓ News cache: %d/%d articles relevant — %d sources — categories: %s',
            len(rows), len(unique), sources,
            ', '.join(sorted({a['category'] for a in relevant})),
        )
    except Exception as e:
        log.error('News cache insert: %s', e)


def scrape_reddit():
    """Scrape trending posts from finance subreddits → save sentiment to memory."""
    SUBREDDITS = ['investing', 'stocks', 'PersonalFinanceCanada', 'canadianinvestor']
    cutoff = datetime.datetime.now().timestamp() - 14 * 86400

    for sub in SUBREDDITS:
        try:
            r = requests.get(
                f'https://www.reddit.com/r/{sub}/hot.json?limit=10',
                headers={'User-Agent': 'FinanceAI/1.0'}, timeout=10
            )
            if not r.ok:
                continue
            for p in r.json()['data']['children']:
                d = p['data']
                if d.get('created_utc', 0) >= cutoff and not d.get('stickied'):
                    save_memory(
                        f"[r/{sub}] {d['title']} (score:{d['score']})",
                        'sentiment', importance=5,
                    )
        except Exception as e:
            log.warning('Reddit r/%s: %s', sub, e)


def scrape_youtube_rss():
    """Scrape YouTube RSS for major finance channels → save to memory."""
    CHANNELS = {
        'ARK Invest': 'UCRo-vRW4bkwgV5hBPoXhFiQ',
        'Berkshire':  'UCK4tQ7OQXe0V2H3KDZW9_cQ',
        'Ray Dalio':  'UC16nlN5KmgEq1ryoxJf0OAw',
    }
    cutoff = datetime.datetime.now() - datetime.timedelta(weeks=2)

    for name, channel_id in CHANNELS.items():
        try:
            r = requests.get(
                f'https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}',
                timeout=10
            )
            if not r.ok:
                continue
            titles    = re.findall(r'<title>([^<]+)</title>', r.text)[1:]
            pub_dates = re.findall(r'<published>([^<]+)</published>', r.text)
            for title, pub in zip(titles[:5], pub_dates[:5]):
                pub_dt = datetime.datetime.fromisoformat(
                    pub.replace('Z', '+00:00')
                ).replace(tzinfo=None)
                if pub_dt >= cutoff:
                    save_memory(f"[{name}] {title}", 'youtube', importance=6)
                    log.info('YouTube: [%s] %s', name, title[:60])
        except Exception as e:
            log.warning('YouTube %s: %s', name, e)


# ─── Schedule ─────────────────────────────────────────────────────────────────

schedule.every(15).minutes.do(autonomous_market_scan)
schedule.every(30).minutes.do(refresh_news_cache)
schedule.every(2).hours.do(scrape_reddit)
schedule.every(6).hours.do(scrape_youtube_rss)
schedule.every().day.at('22:00').do(deep_nightly_analysis)
schedule.every().day.at('22:30').do(resolve_predictions)

if __name__ == '__main__':
    log.info('FinanceAI autonomous agent started.')
    refresh_news_cache()
    scrape_reddit()
    autonomous_market_scan()   # Run immediately on startup
    while True:
        schedule.run_pending()
        time.sleep(30)
