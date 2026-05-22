import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Tu es un trader avec 20 ans d'expérience. Analyse ce graphique en 5 points maximum, 750 caractères maximum. Format obligatoire :
📈 Tendance : [haussière/baissière/neutre]
🔑 Niveaux clés : support $X / résistance $Y
📊 Indicateurs : [RSI + MACD en 1 phrase]
⚡ Signal : [ce qui va probablement se passer + délai estimé]
🎯 Conclusion : [acheter/vendre/attendre] avec [X]% de conviction`;

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, symbol } = await req.json() as {
      imageBase64: string;
      symbol: string;
    };

    if (!imageBase64 || !symbol) {
      return NextResponse.json({ error: 'imageBase64 and symbol required' }, { status: 400 });
    }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: `Voici le graphique TradingView de ${symbol}. Si le rendu du graphique n'est pas parfaitement lisible (iframe CORS), utilise ta connaissance du marché pour ${symbol} et fournis l'analyse dans le format demandé.`,
            },
          ],
        },
      ],
    });

    const block = response.content[0];
    const analysis = block.type === 'text' ? block.text.trim() : '';

    return NextResponse.json({ analysis });
  } catch (err) {
    console.error('[analyze-chart] error:', err);
    return NextResponse.json({ error: 'Analyse échouée' }, { status: 500 });
  }
}
