import anthropic
import os
import json
from supabase import create_client, Client

client_ai = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))
supabase: Client = create_client(
    os.getenv('NEXT_PUBLIC_SUPABASE_URL'),
    os.getenv('SUPABASE_SERVICE_ROLE_KEY')
)

SYSTEM_PROMPT = """Tu es FinanceAI, un conseiller financier IA expert et personnel.
Tu as accès aux données du marché en temps réel et tu donnes des conseils
précis, professionnels et actionnables. Tu réponds toujours en français
sauf si le client te parle en anglais. Tu ne donnes jamais de conseils
irresponsables. Tu es direct, concis et utile.
Ne jamais recommander d'investissements spécifiques sans disclaimer légal.
Toujours mentionner que les marchés comportent des risques."""


def handle_chat_message(conversation_id: str, message: str, history: list) -> str:
    """Traite un message de chat et retourne la réponse de l'agent"""

    messages = [
        *history,
        {"role": "user", "content": message}
    ]

    response = client_ai.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=messages
    )

    assistant_message = response.content[0].text

    # Sauvegarde dans Supabase
    try:
        updated_messages = history + [
            {"role": "user", "content": message},
            {"role": "assistant", "content": assistant_message}
        ]

        supabase.table('conversations').update({
            'messages': json.dumps(updated_messages),
            'updated_at': 'now()'
        }).eq('id', conversation_id).execute()
    except Exception as e:
        print(f"Erreur sauvegarde conversation: {e}")

    return assistant_message


def get_or_create_conversation(client_id: str) -> dict:
    """Récupère ou crée une conversation pour un client"""
    try:
        result = supabase.table('conversations') \
            .select('*') \
            .eq('client_id', client_id) \
            .order('created_at', desc=True) \
            .limit(1) \
            .execute()

        if result.data:
            return result.data[0]

        # Crée une nouvelle conversation
        new_conv = supabase.table('conversations').insert({
            'client_id': client_id,
            'messages': json.dumps([])
        }).execute()

        return new_conv.data[0] if new_conv.data else {'id': None, 'messages': '[]'}
    except Exception as e:
        print(f"Erreur gestion conversation: {e}")
        return {'id': None, 'messages': '[]'}
