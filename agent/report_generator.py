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

    prompt = f"""Tu es un analyste financier senior de niveau Goldman Sachs.
Génère un rapport financier matinal complet, professionnel et actionnable.

DONNÉES DU MARCHÉ:
{market_summary}

CRYPTO:
{crypto_summary}

DONNÉES MACRO:
{macro_summary}

ACTUALITÉS DU JOUR:
{news_summary}

PROFIL CLIENT:
- Profil de risque: {risk_profile} (conservateur/modéré/agressif)
- Actifs surveillés: {watched_assets}
- Langue: {language_map.get(language, 'français')}

STRUCTURE DU RAPPORT (réponds en {language_map.get(language, 'français')}):

## 📊 Résumé exécutif
(3-4 phrases, l'essentiel du jour en un coup d'oeil)

## 🌍 État des marchés
(Analyse des indices avec contexte, pas juste les chiffres)

## 📰 Impact des actualités
(Les 3-5 nouvelles les plus importantes et leur impact sur les investissements)

## 🎯 Score de sentiment du marché: X/100
(Justifie le score en 2-3 phrases)

## 💡 Top 3 opportunités du jour
(Basées sur le profil de risque du client)

## ⚠️ Top 3 risques à surveiller
(Concrets et actuels)

## 🚀 Conseils d'action
(Actions concrètes que le client peut prendre aujourd'hui)

## 🔭 Outlook 48-72h
(Ce qu'il faut surveiller dans les prochains jours)

Sois précis, professionnel et actionnable. Évite le jargon inutile.
À la fin, indique le score de sentiment sous ce format exact: SENTIMENT_SCORE: XX"""

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
