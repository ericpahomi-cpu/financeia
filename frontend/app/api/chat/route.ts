import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  defaultHeaders: { 'anthropic-beta': 'web-search-2025-03-05' },
});

const supabaseAdmin = createSupabaseAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LANG_NAMES: Record<string, string> = {
  fr: 'français',
  en: 'English',
  es: 'español',
  ru: 'русский',
  ro: 'română',
};

/** Strip markdown before storing or streaming to the client. Preserves [CHART:X] tags. */
function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*\*([\s\S]+?)\*\*\*/g, '$1')
    .replace(/\*\*([\s\S]+?)\*\*/g, '$1')
    .replace(/\*([\s\S]+?)\*/g, '$1')
    .replace(/_{2}([\s\S]+?)_{2}/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^-{3,}\s*$/gm, '')
    .replace(/^={3,}\s*$/gm, '')
    .replace(/```[\s\S]*?```/g, (m) =>
      m.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, ''))
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();
    if (!message) {
      return new Response(JSON.stringify({ error: 'Message requis' }), { status: 400 });
    }

    // ── Auth ─────────────────────────────────────────────────────────────────
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
    }

    const firstName = (
      (user.user_metadata?.full_name as string) ||
      user.email?.split('@')[0] ||
      'Client'
    ).split(' ')[0];

    // ── Fetch history + user preferences in parallel ──────────────────────────
    const [historyResult, prefsResult] = await Promise.all([
      supabaseAdmin
        .from('conversations')
        .select('role, content')
        .eq('client_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabaseAdmin
        .from('user_preferences')
        .select('language, level, risk_profile')
        .eq('user_id', user.id)
        .single(),
    ]);

    if (historyResult.error) {
      console.error('[chat] history fetch error:', historyResult.error.message, historyResult.error.code);
    }

    // Chronological order for Claude (oldest → newest)
    const history = historyResult.data ? [...historyResult.data].reverse() : [];
    const prefs   = prefsResult.data as { language?: string; level?: string; risk_profile?: string } | null;
    const lang      = prefs?.language ?? 'fr';
    const level     = prefs?.level    ?? 'beginner';
    const langLabel = LANG_NAMES[lang] ?? 'français';
    const isFirstMessage = history.length === 0;

    console.log(`[chat] user=${user.id} history=${history.length} lang=${lang} level=${level}`);

    // ── System prompt ─────────────────────────────────────────────────────────
    const systemPrompt = `Tu es le conseiller financier personnel de ${firstName}. Réponds uniquement en ${langLabel}.

Tu parles comme un conseiller qui connaît bien son client — chaleureux, direct, jamais condescendant. ${level === 'expert' ? 'Tu peux utiliser le vocabulaire technique, ' + firstName + ' s\'y connaît.' : 'Tu expliques simplement, sans jargon.'} Tu vas droit au but en 2 à 4 phrases. Pas de listes à puces, pas de titres, pas de mise en forme — du texte naturel, comme si tu parlais en face à face.

${isFirstMessage
  ? `C'est votre premier échange : accueille ${firstName} chaleureusement en une seule phrase, puis réponds directement à sa question.`
  : `Tu connais déjà ${firstName}. Ne commence jamais par une salutation — plonge directement dans la réponse.`}

Pour tout prix d'un actif (action, crypto, indice, ETF, devise), cherche avec web_search avant de répondre. Tu ne cites jamais un prix de mémoire, même approximatif — tes données d'entraînement sont périmées. Une fois le prix obtenu, mentionne la source et l'heure. Si la recherche échoue, dis-le clairement sans inventer.

Quand tu mentionnes une action ou une crypto, termine toujours ta réponse par le tag [CHART:SYMBOLE]. Par exemple : [CHART:BTC-USD], [CHART:AAPL], [CHART:NVDA]. Ne renvoie jamais vers un site externe — l'application affiche les graphiques directement.

Symboles crypto : BTC-USD, ETH-USD, SOL-USD, BNB-USD, XRP-USD, DOGE-USD, AVAX-USD, ADA-USD, LINK-USD, MATIC-USD. Symboles actions : AAPL, MSFT, TSLA, AMZN, GOOGL, NVDA, META, NFLX, SHOP, COIN, JPM, BAC, GS, V, MA, AMD.`;

    // ── Messages for Claude ───────────────────────────────────────────────────
    const claudeMessages: { role: 'user' | 'assistant'; content: string }[] = [
      ...history.map((m) => ({
        role:    m.role as 'user' | 'assistant',
        content: m.content as string,
      })),
      { role: 'user', content: message },
    ];

    // ── Stream ────────────────────────────────────────────────────────────────
    const stream = await anthropic.messages.stream({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      system:     systemPrompt,
      tools:      [{ type: 'web_search_20250305', name: 'web_search' }],
      messages:   claudeMessages,
    });

    const encoder = new TextEncoder();
    let assistantContent = '';

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (
              chunk.type === 'content_block_delta' &&
              chunk.delta.type === 'text_delta'
            ) {
              assistantContent += chunk.delta.text;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`)
              );
            }
          }

          // ── Save BEFORE [DONE] — prevents serverless kill ─────────────────
          if (assistantContent) {
            const cleanContent = stripMarkdown(assistantContent);
            const { error: saveError } = await supabaseAdmin
              .from('conversations')
              .insert([
                { client_id: user.id, role: 'user',      content: message      },
                { client_id: user.id, role: 'assistant', content: cleanContent },
              ]);
            if (saveError) {
              console.error('[chat] save error:', saveError.message, saveError.code);
            } else {
              console.log(`[chat] saved — user=${user.id} chars=${cleanContent.length}`);
            }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (error) {
          console.error('[chat] stream error:', error);
          controller.error(error);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection:      'keep-alive',
      },
    });
  } catch (error) {
    console.error('[chat] API error:', error);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500 });
  }
}
