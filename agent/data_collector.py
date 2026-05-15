import yfinance as yf
import requests
import os
from datetime import datetime, timedelta

NEWS_API_KEY = os.getenv('NEWS_API_KEY')


def get_market_data():
    """Récupère les prix des indices et actions populaires"""
    symbols = ['^GSPC', '^IXIC', '^DJI', '^GSPTSE', '^FCHI', '^GDAXI',
               'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META',
               'BTC-USD', 'ETH-USD']

    data = {}
    for symbol in symbols:
        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period='2d')
            if len(hist) >= 2:
                current = hist['Close'].iloc[-1]
                previous = hist['Close'].iloc[-2]
                change_pct = ((current - previous) / previous) * 100
                data[symbol] = {
                    'price': round(float(current), 2),
                    'change_pct': round(float(change_pct), 2),
                    'direction': 'up' if change_pct > 0 else 'down'
                }
        except Exception as e:
            print(f"Erreur pour {symbol}: {e}")

    return data


def get_crypto_data():
    """Récupère les données crypto via CoinGecko (gratuit, sans clé)"""
    url = "https://api.coingecko.com/api/v3/coins/markets"
    params = {
        'vs_currency': 'usd',
        'order': 'market_cap_desc',
        'per_page': 10,
        'page': 1,
        'price_change_percentage': '24h'
    }
    try:
        response = requests.get(url, params=params, timeout=10)
        return response.json()
    except Exception as e:
        print(f"Erreur CoinGecko: {e}")
        return []


def get_financial_news():
    """Récupère les actualités financières mondiales"""
    url = "https://newsapi.org/v2/top-headlines"
    params = {
        'category': 'business',
        'language': 'en',
        'pageSize': 20,
        'apiKey': NEWS_API_KEY
    }
    try:
        response = requests.get(url, params=params, timeout=10)
        data = response.json()
        return data.get('articles', [])
    except Exception as e:
        print(f"Erreur NewsAPI: {e}")
        return []


def get_macro_data():
    """Récupère les données macro via World Bank API (gratuit)"""
    indicators = {
        'inflation_usa': 'FP.CPI.TOTL.ZG',
        'gdp_growth_usa': 'NY.GDP.MKTP.KD.ZG',
    }
    macro = {}
    for name, indicator in indicators.items():
        try:
            url = f"https://api.worldbank.org/v2/country/US/indicator/{indicator}"
            params = {'format': 'json', 'mrv': 1}
            response = requests.get(url, params=params, timeout=10)
            data = response.json()
            if data and len(data) > 1 and data[1]:
                macro[name] = data[1][0].get('value')
        except Exception as e:
            print(f"Erreur World Bank pour {name}: {e}")

    # Prix du pétrole via Yahoo Finance
    try:
        oil = yf.Ticker('CL=F')
        hist = oil.history(period='2d')
        if len(hist) >= 1:
            macro['oil_price_wti'] = round(float(hist['Close'].iloc[-1]), 2)
    except Exception as e:
        print(f"Erreur pétrole: {e}")

    return macro


def collect_all_data():
    """Collecte toutes les données en une seule fonction"""
    print("Collecte des données en cours...")
    return {
        'market_data': get_market_data(),
        'crypto_data': get_crypto_data(),
        'news': get_financial_news(),
        'macro_data': get_macro_data(),
        'collected_at': datetime.now().isoformat()
    }
