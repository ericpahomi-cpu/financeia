import re
import resend
import os
import datetime
import json
import anthropic
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

resend.api_key = os.getenv('RESEND_API_KEY')
_SUPABASE = create_client(os.getenv('SUPABASE_URL', ''), os.getenv('SUPABASE_SERVICE_ROLE_KEY', ''))

# Section titles produced by report_generator.py — written in ALL CAPS
_SECTION_PATTERN = re.compile(
    r'^(RÉSUMÉ DU JOUR|ÉTAT DES MARCHÉS|ACTUALITÉS ET IMPACT|SENTIMENT DU MARCHÉ'
    r'|OPPORTUNITÉS ET RISQUES|CONSEILS POUR AUJOURD\'HUI|PERSPECTIVES 48-72H'
    r'|[A-ZÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸ][A-ZÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸ\s\-]{3,})$'
)


def _report_to_html(text: str) -> str:
    """Convert plain-text report (no markdown) to clean HTML paragraphs."""
    html_parts = []
    paragraph_lines: list[str] = []

    def flush_paragraph():
        content = ' '.join(paragraph_lines).strip()
        if content:
            # Strip any residual markdown bold/italic markers
            content = re.sub(r'\*{1,3}(.*?)\*{1,3}', r'\1', content)
            content = re.sub(r'#{1,6}\s*', '', content)
            html_parts.append(f'<p>{content}</p>')
        paragraph_lines.clear()

    for raw_line in text.splitlines():
        line = raw_line.strip()

        if not line:
            flush_paragraph()
            continue

        if _SECTION_PATTERN.match(line):
            flush_paragraph()
            # Capitalise properly: "ÉTAT DES MARCHÉS" → "État des marchés"
            title = line.capitalize()
            html_parts.append(f'<h3>{title}</h3>')
            continue

        # Strip list markers (-, •, *) at line start
        line = re.sub(r'^[-•*]\s+', '', line)
        paragraph_lines.append(line)

    flush_paragraph()
    return '\n'.join(html_parts)


def send_report_email(to_email: str, client_name: str, report: dict):
    """Envoie le rapport par email via Resend"""

    sentiment = report['sentiment_score']
    if sentiment >= 65:
        sentiment_color = '#10b981'
        sentiment_label = '🟢 Positif'
    elif sentiment >= 40:
        sentiment_color = '#f59e0b'
        sentiment_label = '🟡 Neutre'
    else:
        sentiment_color = '#ef4444'
        sentiment_label = '🔴 Prudence'

    content_html = _report_to_html(report['content'])

    today = datetime.date.today().strftime('%d %B %Y')

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {{
                font-family: Arial, sans-serif;
                background: #ffffff;
                color: #1a1a1a;
                margin: 0;
                padding: 0;
                font-size: 13px;
                line-height: 1.6;
            }}
            .container {{
                max-width: 600px;
                margin: 0 auto;
                background: #ffffff;
            }}
            .header {{
                padding: 25px 25px 20px;
                border-bottom: 1px solid #eeeeee;
            }}
            .header-name {{
                font-size: 18px;
                font-weight: 700;
                color: #1a1a1a;
                margin: 0 0 4px;
            }}
            .header-date {{
                font-size: 13px;
                color: #666666;
                margin: 0 0 14px;
            }}
            .header-greeting {{
                font-size: 13px;
                color: #1a1a1a;
                margin: 0 0 14px;
            }}
            .sentiment-badge {{
                display: inline-block;
                background: {sentiment_color};
                color: #ffffff;
                font-size: 12px;
                font-weight: 700;
                padding: 3px 10px;
                border-radius: 3px;
            }}
            .content {{
                padding: 25px;
            }}
            .report-body {{
                font-size: 13px;
                line-height: 1.6;
                color: #1a1a1a;
            }}
            .report-body h3 {{
                font-size: 14px;
                font-weight: 700;
                color: #1a1a1a;
                margin: 22px 0 6px;
                padding-bottom: 6px;
                border-bottom: 1px solid #eeeeee;
            }}
            .report-body h3:first-child {{
                margin-top: 0;
            }}
            .report-body p {{
                margin: 0 0 10px;
                color: #1a1a1a;
            }}
            .footer {{
                border-top: 1px solid #eeeeee;
                padding: 16px 25px;
                color: #999999;
                font-size: 12px;
                line-height: 1.5;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <p class="header-name">FinanceAI</p>
                <p class="header-date">Rapport du {today}</p>
                <p class="header-greeting">Bonjour {client_name},</p>
                <span class="sentiment-badge">{sentiment_label} — {sentiment}/100</span>
            </div>
            <div class="content">
                <div class="report-body">
                    {content_html}
                </div>
            </div>
            <div class="footer">
                <p style="margin:0 0 4px">FinanceAI — Conseiller financier IA personnel</p>
                <p style="margin:0">Ce rapport est fourni à titre informatif uniquement et ne constitue pas un conseil en investissement.</p>
            </div>
        </div>
    </body>
    </html>
    """

    try:
        params = {
            "from": f"{os.getenv('FROM_NAME', 'FinanceAI')} <{os.getenv('FROM_EMAIL', 'onboarding@resend.dev')}>",
            "to": [to_email],
            "subject": f"📈 Votre rapport financier du {today}",
            "html": html_body,
        }
        email = resend.Emails.send(params)
        print(f"Email envoyé à {to_email}: {email}")
        return True
    except Exception as e:
        print(f"Erreur envoi email: {e}")
        return False


# ─── Weekly report ───────────────────────────────────────────────────────────

def _fetch_weekly_predictions() -> list[dict]:
    """Returns predictions from the last 7 days."""
    try:
        since = (datetime.datetime.now() - datetime.timedelta(days=7)).isoformat()
        res = (_SUPABASE.from_('predictions')
               .select('asset, direction, confidence, reasoning, was_correct, result, predicted_at')
               .gte('predicted_at', since)
               .order('predicted_at', desc=True)
               .execute())
        return res.data or []
    except Exception as e:
        print(f'Weekly predictions fetch error: {e}')
        return []


def _fetch_weekly_memories() -> list[dict]:
    """Returns the top agent insights from the last 7 days."""
    try:
        since = (datetime.datetime.now() - datetime.timedelta(days=7)).isoformat()
        res = (_SUPABASE.from_('agent_memory')
               .select('content, category, importance, created_at')
               .gte('created_at', since)
               .order('importance', desc=True)
               .limit(30)
               .execute())
        return res.data or []
    except Exception as e:
        print(f'Weekly memories fetch error: {e}')
        return []


def _generate_weekly_summary(memories: list[dict], predictions: list[dict]) -> str:
    """Ask Claude to write a concise weekly recap."""
    anthr = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY', ''))

    memory_text = '\n'.join(f"- {m['content']}" for m in memories[:20])
    pred_lines = []
    for p in predictions:
        status = ''
        if p.get('was_correct') is True:
            status = '✅'
        elif p.get('was_correct') is False:
            status = '❌'
        pred_lines.append(
            f"- {p['asset']} {p['direction']} (confiance {p['confidence']}%) {status}"
        )
    pred_text = '\n'.join(pred_lines) if pred_lines else 'Aucun pronostic cette semaine.'

    correct = sum(1 for p in predictions if p.get('was_correct') is True)
    resolved = sum(1 for p in predictions if p.get('was_correct') is not None)
    accuracy_line = (f"Taux de précision : {correct}/{resolved} ({int(correct/resolved*100)}%)"
                     if resolved else "Aucun pronostic résolu cette semaine.")

    prompt = f"""Tu es un conseiller financier IA. Rédige un résumé hebdomadaire en texte clair (sans markdown).
Utilise des titres de sections en MAJUSCULES comme séparateurs. Sois concis — maximum 400 mots.

INSIGHTS DE LA SEMAINE (collectés par l'agent) :
{memory_text}

PRONOSTICS DE LA SEMAINE :
{pred_text}
{accuracy_line}

Sections attendues :
BILAN DE LA SEMAINE
POINTS MARQUANTS
PRONOSTICS ET PRÉCISION
CE QU'IL FAUT SURVEILLER LA SEMAINE PROCHAINE"""

    try:
        response = anthr.messages.create(
            model='claude-haiku-4-5',
            max_tokens=800,
            messages=[{'role': 'user', 'content': prompt}]
        )
        return response.content[0].text
    except Exception as e:
        print(f'Weekly summary generation error: {e}')
        return 'Résumé non disponible cette semaine.'


def _predictions_table_html(predictions: list[dict]) -> str:
    """Render predictions as a simple HTML table."""
    if not predictions:
        return '<p style="color:#999999;font-size:13px;">Aucun pronostic cette semaine.</p>'

    rows = ''
    for p in predictions:
        direction_color = '#10b981' if p['direction'] == 'hausse' else '#ef4444' if p['direction'] == 'baisse' else '#f59e0b'
        if p.get('was_correct') is True:
            status_icon = '✅'
        elif p.get('was_correct') is False:
            status_icon = '❌'
        else:
            status_icon = '⏳'
        date_str = p.get('predicted_at', '')[:10]
        rows += f"""
        <tr>
          <td style="padding:6px 8px;font-weight:700;">{p['asset']}</td>
          <td style="padding:6px 8px;color:{direction_color};font-weight:600;">{p['direction'].capitalize()}</td>
          <td style="padding:6px 8px;">{p['confidence']}%</td>
          <td style="padding:6px 8px;">{p.get('result', '—')}</td>
          <td style="padding:6px 8px;text-align:center;">{status_icon}</td>
          <td style="padding:6px 8px;color:#999999;">{date_str}</td>
        </tr>"""

    correct = sum(1 for p in predictions if p.get('was_correct') is True)
    resolved = sum(1 for p in predictions if p.get('was_correct') is not None)
    accuracy = f"{int(correct/resolved*100)}%" if resolved else "—"

    return f"""
    <p style="font-size:13px;margin:0 0 8px;"><strong>Taux de précision :</strong>
      {correct}/{resolved} ({accuracy})
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr style="border-bottom:2px solid #eeeeee;color:#666666;">
          <th style="padding:6px 8px;text-align:left;">Actif</th>
          <th style="padding:6px 8px;text-align:left;">Direction</th>
          <th style="padding:6px 8px;text-align:left;">Confiance</th>
          <th style="padding:6px 8px;text-align:left;">Résultat</th>
          <th style="padding:6px 8px;text-align:center;">Statut</th>
          <th style="padding:6px 8px;text-align:left;">Date</th>
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>"""


def send_weekly_report(to_email: str, client_name: str):
    """Génère et envoie le bilan hebdomadaire à un client."""
    predictions = _fetch_weekly_predictions()
    memories = _fetch_weekly_memories()
    summary_text = _generate_weekly_summary(memories, predictions)
    summary_html = _report_to_html(summary_text)
    predictions_html = _predictions_table_html(predictions)

    week_label = datetime.date.today().strftime('Semaine du %d %B %Y')

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {{
                font-family: Arial, sans-serif;
                background: #ffffff;
                color: #1a1a1a;
                margin: 0;
                padding: 0;
                font-size: 13px;
                line-height: 1.6;
            }}
            .container {{ max-width: 600px; margin: 0 auto; background: #ffffff; }}
            .header {{
                padding: 25px 25px 20px;
                border-bottom: 1px solid #eeeeee;
            }}
            .header-name {{ font-size: 18px; font-weight: 700; color: #1a1a1a; margin: 0 0 4px; }}
            .header-date {{ font-size: 13px; color: #666666; margin: 0 0 14px; }}
            .header-greeting {{ font-size: 13px; color: #1a1a1a; margin: 0 0 6px; }}
            .weekly-badge {{
                display: inline-block;
                background: #4f46e5;
                color: #ffffff;
                font-size: 12px;
                font-weight: 700;
                padding: 3px 10px;
                border-radius: 3px;
            }}
            .content {{ padding: 25px; }}
            .report-body {{ font-size: 13px; line-height: 1.6; color: #1a1a1a; }}
            .report-body h3 {{
                font-size: 14px;
                font-weight: 700;
                color: #1a1a1a;
                margin: 22px 0 6px;
                padding-bottom: 6px;
                border-bottom: 1px solid #eeeeee;
            }}
            .report-body h3:first-child {{ margin-top: 0; }}
            .report-body p {{ margin: 0 0 10px; color: #1a1a1a; }}
            .predictions-section {{
                margin-top: 24px;
                padding-top: 20px;
                border-top: 1px solid #eeeeee;
            }}
            .predictions-title {{
                font-size: 14px;
                font-weight: 700;
                color: #1a1a1a;
                margin: 0 0 14px;
            }}
            .footer {{
                border-top: 1px solid #eeeeee;
                padding: 16px 25px;
                color: #999999;
                font-size: 12px;
                line-height: 1.5;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <p class="header-name">FinanceAI</p>
                <p class="header-date">Bilan hebdomadaire — {week_label}</p>
                <p class="header-greeting">Bonjour {client_name},</p>
                <span class="weekly-badge">📅 Récapitulatif de la semaine</span>
            </div>
            <div class="content">
                <div class="report-body">
                    {summary_html}
                </div>
                <div class="predictions-section">
                    <p class="predictions-title">📊 Pronostics de la semaine</p>
                    {predictions_html}
                </div>
            </div>
            <div class="footer">
                <p style="margin:0 0 4px">FinanceAI — Conseiller financier IA personnel</p>
                <p style="margin:0">Ce rapport est fourni à titre informatif uniquement et ne constitue pas un conseil en investissement.</p>
            </div>
        </div>
    </body>
    </html>
    """

    today_str = datetime.date.today().strftime('%d %B %Y')
    try:
        params = {
            "from": f"{os.getenv('FROM_NAME', 'FinanceAI')} <{os.getenv('FROM_EMAIL', 'onboarding@resend.dev')}>",
            "to": [to_email],
            "subject": f"📅 Votre bilan FinanceAI — {week_label}",
            "html": html_body,
        }
        email = resend.Emails.send(params)
        print(f"Weekly email sent to {to_email}: {email}")
        return True
    except Exception as e:
        print(f"Weekly email error: {e}")
        return False


def send_weekly_report_all_clients():
    """Envoie le bilan hebdomadaire à tous les clients."""
    try:
        res = _SUPABASE.from_('clients').select('id, email, name').execute()
        clients = res.data or []
    except Exception as e:
        print(f'Clients fetch error: {e}')
        return

    for client in clients:
        email = client.get('email', '')
        name = client.get('name', 'Investisseur')
        if email:
            print(f'Sending weekly report to {email}...')
            send_weekly_report(email, name)
