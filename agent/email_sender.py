import resend
import os
import datetime

resend.api_key = os.getenv('RESEND_API_KEY')


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

    # Convertit le markdown en HTML simple
    content_html = report['content'].replace('\n', '<br>').replace('##', '<h3>').replace('**', '<strong>')

    today = datetime.date.today().strftime('%d %B %Y')

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                   background: #0a0a0f; color: #e2e8f0; margin: 0; padding: 20px; }}
            .container {{ max-width: 700px; margin: 0 auto; }}
            .header {{ background: linear-gradient(135deg, #6366f1, #8b5cf6);
                      padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }}
            .header h1 {{ color: white; margin: 0; font-size: 28px; }}
            .header p {{ color: rgba(255,255,255,0.8); margin: 8px 0 0; }}
            .sentiment-badge {{ display: inline-block; background: {sentiment_color};
                               color: white; padding: 8px 20px; border-radius: 20px;
                               font-weight: bold; font-size: 18px; margin: 15px 0; }}
            .content {{ background: #1a1a2e; padding: 30px; border-radius: 0 0 12px 12px; }}
            .report-body {{ line-height: 1.8; font-size: 15px; }}
            .footer {{ text-align: center; padding: 20px; color: #64748b; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>📈 FinanceAI — Rapport du matin</h1>
                <p>Bonjour {client_name} — Voici votre analyse financière du jour</p>
                <div class="sentiment-badge">
                    Sentiment du marché: {sentiment}/100 {sentiment_label}
                </div>
            </div>
            <div class="content">
                <div class="report-body">
                    {content_html}
                </div>
            </div>
            <div class="footer">
                <p>FinanceAI — Votre conseiller financier IA personnel</p>
                <p>Ce rapport est généré automatiquement à des fins informationnelles uniquement.</p>
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
