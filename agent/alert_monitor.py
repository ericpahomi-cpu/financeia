import os 
from dotenv import load_dotenv
load_dotenv()
from supabase import create_client, Client

supabase: Client = create_client(
    os.getenv('NEXT_PUBLIC_SUPABASE_URL'),
    os.getenv('SUPABASE_SERVICE_ROLE_KEY')
)


def check_price_alerts(market_data: dict, clients: list):
    """Vérifie les alertes de prix pour chaque client"""
    alerts_created = []

    for client in clients:
        alert_settings = client.get('alert_settings', {})
        watched_assets = client.get('watched_assets', [])

        for asset in watched_assets:
            if asset not in market_data:
                continue

            asset_data = market_data[asset]
            change_pct = asset_data.get('change_pct', 0)

            # Alerte si variation > 5%
            threshold = alert_settings.get('price_threshold', 5.0)

            if abs(change_pct) >= threshold:
                direction = "hausse" if change_pct > 0 else "baisse"
                message = f"{asset} en {direction} de {abs(change_pct):.2f}% aujourd'hui"

                try:
                    alert = supabase.table('alerts').insert({
                        'client_id': client['id'],
                        'type': 'price_movement',
                        'asset': asset,
                        'message': message,
                        'is_read': False
                    }).execute()
                    alerts_created.append(alert.data[0] if alert.data else None)
                    print(f"Alerte créée: {message}")
                except Exception as e:
                    print(f"Erreur création alerte: {e}")

    return alerts_created


def get_unread_alerts(client_id: str) -> list:
    """Récupère les alertes non lues d'un client"""
    try:
        result = supabase.table('alerts') \
            .select('*') \
            .eq('client_id', client_id) \
            .eq('is_read', False) \
            .order('triggered_at', desc=True) \
            .limit(10) \
            .execute()
        return result.data or []
    except Exception as e:
        print(f"Erreur récupération alertes: {e}")
        return []


def mark_alerts_read(alert_ids: list):
    """Marque des alertes comme lues"""
    try:
        supabase.table('alerts') \
            .update({'is_read': True}) \
            .in_('id', alert_ids) \
            .execute()
        return True
    except Exception as e:
        print(f"Erreur marquage alertes: {e}")
        return False
