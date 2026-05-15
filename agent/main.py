import os
import json
from dotenv import load_dotenv
from supabase import create_client, Client
from data_collector import collect_all_data
from report_generator import generate_report
from email_sender import send_report_email
from alert_monitor import check_price_alerts

load_dotenv()

# Connexion Supabase
supabase: Client = create_client(
    os.getenv('NEXT_PUBLIC_SUPABASE_URL'),
    os.getenv('SUPABASE_SERVICE_ROLE_KEY')
)


def run_daily_report():
    """Génère et envoie les rapports pour tous les clients"""
    print("🚀 Démarrage de l'agent FinanceAI...")

    # 1. Collecte des données
    data = collect_all_data()
    print("✅ Données collectées")

    # 2. Récupère tous les clients actifs
    clients_result = supabase.table('clients').select('*').execute()

    if not clients_result.data:
        print("Aucun client trouvé. Génération d'un rapport de test...")
        test_profile = {
            'risk_profile': 'moderate',
            'language': 'fr',
            'watched_assets': ['AAPL', 'MSFT', 'BTC-USD']
        }
        report = generate_report(data, test_profile)
        print("\n📄 RAPPORT GÉNÉRÉ:")
        print(report['content'])
        print(f"\n📊 Score de sentiment: {report['sentiment_score']}/100")
        return

    clients = clients_result.data

    # 3. Vérifie les alertes de prix
    check_price_alerts(data['market_data'], clients)
    print("✅ Alertes vérifiées")

    # 4. Génère et envoie un rapport pour chaque client
    for client in clients:
        print(f"Génération du rapport pour {client['email']}...")

        client_profile = {
            'risk_profile': client.get('risk_profile', 'moderate'),
            'language': client.get('language', 'fr'),
            'watched_assets': client.get('watched_assets', [])
        }

        # Génère le rapport
        report = generate_report(data, client_profile)

        # Sauvegarde dans Supabase
        try:
            supabase.table('reports').insert({
                'client_id': client['id'],
                'content': report['content'],
                'market_data': report['market_data'],
                'sentiment_score': report['sentiment_score']
            }).execute()
        except Exception as e:
            print(f"Erreur sauvegarde rapport: {e}")

        # Envoie par email
        send_report_email(
            to_email=client['email'],
            client_name=client.get('name', 'Client'),
            report=report
        )

        print(f"✅ Rapport envoyé à {client['email']}")

    print("🎉 Tous les rapports ont été générés et envoyés!")


if __name__ == "__main__":
    run_daily_report()
