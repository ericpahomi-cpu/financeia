"""
FinanceAI — Agent continu 24h/24
Tourne sur Railway avec surveillance toutes les 5 minutes pendant les heures de marché.
"""
import os, json, time, logging, datetime
from zoneinfo import ZoneInfo
import schedule
import anthropic
import requests
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger(__name__)

ANTHROPIC = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))
SUPABASE  = create_client(os.getenv('SUPABASE_URL', ''), os.getenv('SUPABASE_SERVICE_ROLE_KEY', ''))
EST = ZoneInfo('America/New_York')

# ─── Helpers ────────────────────────────────────────────────────────────────

def is_market_open() -> bool:
    now = datetime.datetime.now(EST)
    if now.weekday() >= 5:          # Saturday / Sunday
        return False
    t = now.time()
    return datetime.time(9, 30) <= t <= datetime.time(16, 0)

def get_yahoo_price(symbol: str) -> dict | None:
    try:
        url = f'https://query1.finance.yahoo.com/v7/finance/quote?symbols={symbol}&formatted=false'
        r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=10)
        q = r.json()['quoteResponse']['result']
        if not q:
            return None
        return {'symbol': symbol, 'price': q[0]['regularMarketPrice'], 'change_pct': q[0]['regularMarketChangePercent']}
    except Exception as e:
        log.warning('Yahoo price error %s: %s', symbol, e)
        return None

def get_all_clients() -> list[dict]:
    try:
        res = SUPABASE.from_('clients').select('id, email, name, alert_threshold').execute()
        return res.data or []
    except Exception as e:
        log.error('Clients fetch error: %s', e)
        return []

def get_client_favorites(client_id: str) -> list[dict]:
    try:
        res = SUPABASE.from_('favorites').select('symbol, type, name').eq('client_id', client_id).execute()
        return res.data or []
    except Exception:
        return []

def get_alert_threshold(client_id: str, default: float = 5.0) -> float:
    try:
        res = SUPABASE.from_('user_settings').select('alert_threshold').eq('id', client_id).single().execute()
        return float(res.data.get('alert_threshold', default)) if res.data else default
    except Exception:
        return default

def send_alert_email(to_email: str, subject: str, body: str):
    import resend
    resend.api_key = os.getenv('RESEND_API_KEY', '')
    try:
        resend.Emails.send({
            'from': f"{os.getenv('FROM_NAME','FinanceAI')} <{os.getenv('FROM_EMAIL','onboarding@resend.dev')}>",
            'to': [to_email],
            'subject': subject,
            'html': f'<div style="font-family:Arial;max-width:600px;margin:auto;padding:20px"><p>{body}</p></div>',
        })
        log.info('Alert email sent to %s', to_email)
    except Exception as e:
        log.error('Email error: %s', e)

def save_alert(client_id: str, asset: str, message: str, alert_type: str = 'price'):
    try:
        SUPABASE.from_('alerts').insert({
            'client_id': client_id,
            'type': alert_type,
            'asset': asset,
            'message': message,
            'is_read': False,
        }).execute()
    except Exception as e:
        log.error('Save alert error: %s', e)

def save_memory(content: str, category: str, importance: int = 5):
    try:
        SUPABASE.from_('agent_memory').insert({
            'content': content,
            'category': category,
            'importance': importance,
        }).execute()
    except Exception as e:
        log.error('Save memory error: %s', e)

def load_recent_memory(limit: int = 50) -> list[dict]:
    try:
        res = (SUPABASE.from_('agent_memory').select('content, category, importance, created_at')
               .order('importance', desc=True).order('created_at', desc=True).limit(limit).execute())
        return res.data or []
    except Exception:
        return []

def save_prediction(client_id: str | None, asset: str, direction: str, confidence: int, reasoning: str):
    try:
        SUPABASE.from_('predictions').insert({
            'client_id': client_id,
            'asset': asset,
            'direction': direction,
            'confidence': confidence,
            'reasoning': reasoning,
        }).execute()
    except Exception as e:
        log.error('Save prediction error: %s', e)

# ─── Core tasks ─────────────────────────────────────────────────────────────

def check_price_alerts():
    """Vérifie les prix toutes les 5 min pendant les heures de marché."""
    if not is_market_open():
        return

    log.info('Checking price alerts...')
    clients = get_all_clients()
    for client in clients:
        cid   = client.get('id') or client.get('client_id')
        email = client.get('email', '')
        threshold = get_alert_threshold(cid)
        favs = get_client_favorites(cid)

        for fav in favs:
            if fav['type'] != 'stock':
                continue
            data = get_yahoo_price(fav['symbol'])
            if not data:
                continue
            pct = abs(data['change_pct'])
            if pct >= threshold:
                direction = 'hausse' if data['change_pct'] > 0 else 'baisse'
                msg = f"{fav['symbol']} en {direction} de {data['change_pct']:.2f}% aujourd'hui (seuil : {threshold}%)"
                save_alert(cid, fav['symbol'], msg)
                if email:
                    send_alert_email(
                        email,
                        f"⚠️ Alerte FinanceAI : {fav['symbol']} {'+' if data['change_pct'] > 0 else ''}{data['change_pct']:.2f}%",
                        msg
                    )
                    log.info('Alert sent: %s %+.2f%%', fav['symbol'], data['change_pct'])

def scrape_youtube_rss():
    """Scrappe les RSS YouTube des grands investisseurs."""
    CHANNELS = {
        'ARK Invest':       'UCRo-vRW4bkwgV5hBPoXhFiQ',
        'Berkshire':        'UCK4tQ7OQXe0V2H3KDZW9_cQ',
        'Ray Dalio':        'UC16nlN5KmgEq1ryoxJf0OAw',
    }
    two_weeks_ago = datetime.datetime.now() - datetime.timedelta(weeks=2)

    for channel_name, channel_id in CHANNELS.items():
        try:
            url = f'https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}'
            r = requests.get(url, timeout=10)
            if not r.ok:
                continue
            # Basic parsing: extract titles and published dates
            import re
            titles    = re.findall(r'<title>([^<]+)</title>', r.text)[1:]  # skip channel title
            pub_dates = re.findall(r'<published>([^<]+)</published>', r.text)

            for title, pub in zip(titles[:5], pub_dates[:5]):
                pub_dt = datetime.datetime.fromisoformat(pub.replace('Z', '+00:00')).replace(tzinfo=None)
                if pub_dt >= two_weeks_ago:
                    content = f'[{channel_name}] {title} — {pub}'
                    save_memory(content, 'youtube', importance=6)
                    log.info('Saved YouTube insight: %s', title[:60])
        except Exception as e:
            log.warning('YouTube RSS error for %s: %s', channel_name, e)

def scrape_reddit():
    """Scrappe Reddit finance via API publique (pas de clé requise pour GET)."""
    SUBREDDITS = ['investing', 'stocks', 'PersonalFinanceCanada', 'canadianinvestor']
    two_weeks_ago = datetime.datetime.now().timestamp() - 14 * 86400

    for sub in SUBREDDITS:
        try:
            url = f'https://www.reddit.com/r/{sub}/hot.json?limit=10'
            r = requests.get(url, headers={'User-Agent': 'FinanceAI/1.0'}, timeout=10)
            if not r.ok:
                continue
            posts = r.json()['data']['children']
            for p in posts:
                d = p['data']
                if d.get('created_utc', 0) >= two_weeks_ago and not d.get('stickied'):
                    content = f'[r/{sub}] {d["title"]} — score:{d["score"]}'
                    save_memory(content, 'reddit', importance=5)
        except Exception as e:
            log.warning('Reddit error for r/%s: %s', sub, e)

def nightly_market_analysis():
    """Analyse globale nocturne — sauvegarde insights et pronostics."""
    log.info('Running nightly market analysis...')
    memories = load_recent_memory(50)
    memory_context = '\n'.join([f"- {m['content']}" for m in memories[:20]])

    try:
        response = ANTHROPIC.messages.create(
            model='claude-sonnet-4-6',
            max_tokens=1500,
            system='Tu es un analyste financier expert. Réponds UNIQUEMENT en JSON valide, sans markdown.',
            messages=[{
                'role': 'user',
                'content': f"""Voici des insights récents collectés :
{memory_context}

Génère une analyse du marché pour demain. Réponds UNIQUEMENT avec ce JSON :
{{
  "insights": ["insight 1", "insight 2", "insight 3"],
  "predictions": [
    {{"asset": "AAPL", "direction": "hausse", "confidence": 70, "reasoning": "raison courte"}},
    {{"asset": "BTC",  "direction": "neutre", "confidence": 55, "reasoning": "raison courte"}}
  ]
}}"""
            }]
        )
        text = response.content[0].text
        data = json.loads(text)

        for insight in data.get('insights', []):
            save_memory(insight, 'analysis', importance=8)

        for pred in data.get('predictions', []):
            save_prediction(None, pred['asset'], pred['direction'], pred['confidence'], pred['reasoning'])
            log.info('Prediction saved: %s %s %d%%', pred['asset'], pred['direction'], pred['confidence'])

    except Exception as e:
        log.error('Nightly analysis error: %s', e)

def resolve_predictions():
    """Compare les prédictions de la veille avec les résultats réels."""
    yesterday = (datetime.datetime.now() - datetime.timedelta(days=1)).isoformat()
    try:
        res = (SUPABASE.from_('predictions').select('id, asset, direction, confidence')
               .gte('predicted_at', yesterday).is_('was_correct', 'null').execute())
        for pred in (res.data or []):
            data = get_yahoo_price(pred['asset'])
            if not data:
                continue
            actual_dir = 'hausse' if data['change_pct'] > 0 else 'baisse' if data['change_pct'] < -0.5 else 'neutre'
            correct = actual_dir == pred['direction']
            SUPABASE.from_('predictions').update({
                'result': f"{data['change_pct']:+.2f}%",
                'was_correct': correct,
                'resolved_at': datetime.datetime.now().isoformat(),
            }).eq('id', pred['id']).execute()
            log.info('Resolved prediction %s: %s (correct=%s)', pred['asset'], actual_dir, correct)
    except Exception as e:
        log.error('Resolve predictions error: %s', e)

# ─── Schedule ────────────────────────────────────────────────────────────────

schedule.every(5).minutes.do(check_price_alerts)
schedule.every(2).hours.do(scrape_reddit)
schedule.every(6).hours.do(scrape_youtube_rss)
schedule.every().day.at('22:00').do(nightly_market_analysis)
schedule.every().day.at('22:30').do(resolve_predictions)

if __name__ == '__main__':
    log.info('FinanceAI continuous agent started.')
    # Run all tasks once on startup
    scrape_reddit()
    scrape_youtube_rss()
    while True:
        schedule.run_pending()
        time.sleep(30)
