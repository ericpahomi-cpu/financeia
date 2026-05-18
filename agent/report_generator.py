import anthropic
import os
from dotenv import load_dotenv
load_dotenv()
import json

client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))


def generate_report(data: dict, client_profile: dict) -> dict:
    """Génère le rapport financier avec Claude"""

    risk_profile = client_profile.get('risk_profile', 'moderate')
    language = client_profile.get('language', 'fr')
    watched_assets = client_profile.get('watched_assets', [])

    # Prépare un résumé des données pour Claude
    market_summary = json.dumps(data['market_data'], indent=2)
    news_summary = "\n".join([
        f"- {article['title']}"
        for article in data['news'][:15]
        if article.get('title')
    ])
    crypto_summary = "\n".join([
        f"- {coin['name']}: ${coin['current_price']} ({coin.get('price_change_percentage_24h', 0):.2f}%)"
        for coin in data['crypto_data'][:5]
        if isinstance(coin, dict)
    ])
    macro_summary = json.dumps(data['macro_data'], indent=2)

    language_map = {
        'fr': 'français',
        'en': 'English',
        'es': 'español'
    }

    prompt = f"""Tu es un conseiller financier personnel qui parle directement à son client. Ton ton est humain, chaleureux et direct. Tu expliques simplement, sans jargon, comme si tu parlais en face à face.

Utilise uniquement ces titres de sections en majuscules comme séparateurs :

RÉSUMÉ DU JOUR
ÉTAT DES MARCHÉS
ACTUALITÉS ET IMPACT
SENTIMENT DU MARCHÉ
OPPORTUNITÉS ET RISQUES
CONSEILS POUR AUJOURD'HUI
PERSPECTIVES 48-72H

DONNÉES DU MARCHÉ:
{market_summary}

CRYPTO:
{crypto_summary}

DONNÉES MACRO:
{macro_summary}

ACTUALITÉS DU JOUR:
{news_summary}

PROFIL CLIENT:
- Profil de risque: {risk_profile}
- Actifs surveillés: {watched_assets}
- Langue: {language_map.get(language, 'français')}

Règles absolues :
- Aucun markdown : pas de **, ##, ---, *, puces
- Parle directement au client : "vos actifs", "vous devriez", "je vous recommande"
- Explique pourquoi les marchés bougent, pas seulement les chiffres
- Maximum 500 mots
- Termine par : SENTIMENT_SCORE: XX"""

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4000,
        messages=[{"role": "user", "content": prompt}]
    )

    report_content = response.content[0].text

    # Extrait le score de sentiment
    sentiment_score = 50  # défaut
    lines_to_remove = []
    for line in report_content.split('\n'):
        if 'SENTIMENT_SCORE:' in line:
            try:
                sentiment_score = int(line.split(':')[1].strip())
                lines_to_remove.append(line)
            except Exception:
                pass

    for line in lines_to_remove:
        report_content = report_content.replace(line, '').strip()

    return {
        'content': report_content,
        'sentiment_score': sentiment_score,
        'market_data': data['market_data'],
        'generated_at': data['collected_at']
    }
