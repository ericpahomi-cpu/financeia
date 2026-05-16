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
