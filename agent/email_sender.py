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
                background: #f5f5f5;
                color: #1a1a1a;
                margin: 0;
                padding: 20px 10px;
                font-size: 15px;
            }}
            .container {{
                max-width: 600px;
                margin: 0 auto;
                background: #ffffff;
                border: 1px solid #e0e0e0;
                border-radius: 6px;
                overflow: hidden;
            }}
            .header {{
                background: #ffffff;
                border-bottom: 2px solid #6366f1;
                padding: 28px 30px 20px;
            }}
            .header-top {{
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 14px;
            }}
            .logo-badge {{
                background: #6366f1;
                color: #ffffff;
                font-size: 14px;
                font-weight: 700;
                padding: 6px 12px;
                border-radius: 4px;
                letter-spacing: 0.5px;
            }}
            .header-title {{
                font-size: 18px;
                font-weight: 700;
                color: #1a1a1a;
                margin: 0;
            }}
            .header-sub {{
                font-size: 13px;
                color: #6b7280;
                margin: 4px 0 0;
            }}
            .sentiment-bar {{
                display: inline-block;
                background: #f3f4f6;
                border: 1px solid #e5e7eb;
                border-left: 4px solid {sentiment_color};
                border-radius: 4px;
                padding: 8px 14px;
                margin-top: 14px;
                font-size: 14px;
                color: #1a1a1a;
            }}
            .sentiment-score {{
                font-weight: 700;
                color: {sentiment_color};
            }}
            .content {{
                padding: 28px 30px;
            }}
            .report-body {{
                font-size: 15px;
                line-height: 1.7;
                color: #1a1a1a;
                font-weight: 400;
            }}
            .report-body h3 {{
                font-size: 16px;
                font-weight: 700;
                color: #1a1a1a;
                margin: 24px 0 8px;
                padding-bottom: 6px;
                border-bottom: 1px solid #eeeeee;
            }}
            .report-body h3:first-child {{
                margin-top: 0;
            }}
            .report-body p {{
                margin: 0 0 12px;
                color: #1a1a1a;
                font-weight: 400;
            }}
            .footer {{
                border-top: 1px solid #eeeeee;
                background: #f9f9f9;
                text-align: center;
                padding: 16px 20px;
                color: #9ca3af;
                font-size: 12px;
                line-height: 1.5;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="header-top">
                    <span class="logo-badge">FinanceAI</span>
                    <div>
                        <p class="header-title">Rapport du matin — {today}</p>
                        <p class="header-sub">Bonjour {client_name}, voici votre analyse financière du jour.</p>
                    </div>
                </div>
                <div class="sentiment-bar">
                    Sentiment du marché :&nbsp;
                    <span class="sentiment-score">{sentiment}/100</span>
                    &nbsp;— {sentiment_label}
                </div>
            </div>
            <div class="content">
                <div class="report-body">
                    {content_html}
                </div>
            </div>
            <div class="footer">
                <p>FinanceAI — Conseiller financier IA personnel</p>
                <p>Ce rapport est généré automatiquement. Il est fourni à titre informatif uniquement et ne constitue pas un conseil en investissement.</p>
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
