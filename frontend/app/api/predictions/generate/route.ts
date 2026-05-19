import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { symbol } = await req.json();
    if (!symbol || typeof symbol !== 'string') {
      return NextResponse.json({ error: 'Symbole requis' }, { status: 400 });
    }

    const ticker = symbol.trim().toUpperCase();

    // ── Auth ──────────────────────────────────────────────────────────────────
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    // ── Ask Claude Haiku (no web_search — avoids timeouts) ───────────────────
    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 600,
      system:     'Tu es un analyste financier. Réponds UNIQUEMENT avec un objet JSON valide, aucun texte avant ou après, aucun bloc markdown.',
      messages: [{
        role: 'user',
        content: `Génère un pronostic pour l'actif financier "${ticker}" pour les prochaines 48-72 heures, basé sur tes connaissances générales des marchés.

Réponds UNIQUEMENT avec un objet JSON valide :

{
  "direction": "hausse" ou "baisse" ou "neutre",
  "confidence": <entier 0-100>,
  "target_price": null,
  "timeframe": "48-72h",
  "reasoning": "<3-4 phrases naturelles expliquant le raisonnement, sans jargon excessif>",
  "references": [],
  "risks": ["<risque court 1>", "<risque court 2>", "<risque court 3>"]
}`,
      }],
    });

    // ── Extract text block ────────────────────────────────────────────────────
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'Pas de réponse textuelle de Claude' }, { status: 502 });
    }

    // ── Parse JSON (same robust parser as agent) ──────────────────────────────
    let prediction: Record<string, unknown>;
    try {
      let raw = textBlock.text.trim();
      raw = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) raw = match[0];
      prediction = JSON.parse(raw);
    } catch (err) {
      console.error('[predictions/generate] JSON parse error:', err, textBlock.text.slice(0, 200));
      return NextResponse.json({ error: 'Réponse JSON invalide de Claude' }, { status: 502 });
    }

    // ── Sanitise fields ───────────────────────────────────────────────────────
    const VALID_DIRS = ['hausse', 'baisse', 'neutre'] as const;
    type Dir = typeof VALID_DIRS[number];
    const direction: Dir = VALID_DIRS.includes(prediction.direction as Dir)
      ? (prediction.direction as Dir)
      : 'neutre';
    const confidence   = Math.min(100, Math.max(0, Math.round(Number(prediction.confidence) || 50)));
    const target_price = prediction.target_price != null ? Number(prediction.target_price) : null;
    const timeframe    = typeof prediction.timeframe === 'string' ? prediction.timeframe : '48-72h';
    const reasoning    = typeof prediction.reasoning === 'string' ? prediction.reasoning : '';
    const references   = (Array.isArray(prediction.references) ? prediction.references : [])
      .slice(0, 3)
      .filter((r): r is { title: string; url: string } =>
        r && typeof r.title === 'string' && typeof r.url === 'string');
    const risks = (Array.isArray(prediction.risks) ? prediction.risks : [])
      .slice(0, 3)
      .filter((r): r is string => typeof r === 'string');

    // ── Persist to Supabase ───────────────────────────────────────────────────
    const { error: dbError } = await adminSupabase
      .from('predictions')
      .insert({
        client_id:    user.id,
        asset:        ticker,
        direction,
        confidence,
        reasoning,
        predicted_at: new Date().toISOString(),
      });

    if (dbError) {
      console.error('[predictions/generate] DB insert error:', dbError.message, dbError.code);
    }

    // ── Return ────────────────────────────────────────────────────────────────
    return NextResponse.json({
      symbol: ticker,
      direction,
      confidence,
      target_price,
      timeframe,
      reasoning,
      references,
      risks,
    });
  } catch (error) {
    console.error('[predictions/generate] Unexpected error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
