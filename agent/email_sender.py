import re
import resend
import os
import datetime

resend.api_key = os.getenv('RESEND_API_KEY')

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
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
                background: #0a0a0f;
                color: #e2e8f0;
                margin: 0;
                padding: 20px;
                font-size: 15px;
            }}
            .container {{
                max-width: 650px;
                margin: 0 auto;
            }}
            .header {{
                background: linear-gradient(135deg, #6366f1, #8b5cf6);
                padding: 30px;
                border-radius: 12px 12px 0 0;
                text-align: center;
            }}
            .header h1 {{
                color: white;
                margin: 0;
                font-size: 24px;
                font-weight: 700;
            }}
            .header p {{
                color: rgba(255,255,255,0.85);
                margin: 8px 0 0;
                font-size: 14px;
            }}
            .sentiment-badge {{
                display: inline-block;
                background: {sentiment_color};
                color: white;
                padding: 7px 18px;
                border-radius: 20px;
                font-weight: 600;
                font-size: 15px;
                margin: 15px 0 0;
            }}
            .content {{
                background: #1a1a2e;
                padding: 28px 32px;
                border-radius: 0 0 12px 12px;
            }}
            .report-body {{
                font-size: 15px;
                line-height: 1.6;
                font-weight: 400;
            }}
            .report-body h3 {{
                font-size: 16px;
                font-weight: 600;
                color: #a5b4fc;
                margin: 24px 0 8px;
                padding-bottom: 6px;
                border-bottom: 1px solid #2a2a4a;
            }}
            .report-body h3:first-child {{
                margin-top: 0;
            }}
            .report-body p {{
                margin: 0 0 12px;
                color: #cbd5e1;
                font-weight: 400;
            }}
            .footer {{
                text-align: center;
                padding: 20px;
                color: #64748b;
                font-size: 12px;
                line-height: 1.5;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>📈 FinanceAI — Rapport du matin</h1>
                <p>Bonjour {client_name} — Voici votre analyse financière du {today}</p>
                <div class="sentiment-badge">
                    Sentiment du marché : {sentiment}/100 {sentiment_label}
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
