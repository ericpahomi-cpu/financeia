import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { ALL_TOOLS, executeToolByName } from '@/lib/agent-tools';

export const runtime    = 'nodejs';
export const maxDuration = 60;

const anthropic = new Anthropic({
  apiKey:         process.env.ANTHROPIC_API_KEY,
  defaultHeaders: { 'anthropic-beta': 'web-search-2025-03-05' },
});

const supabaseAdmin = createSupabaseAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LANG_NAMES: Record<string, string> = {
  fr: 'français', en: 'English', es: 'español', ru: 'русский', ro: 'română',
};

/** Strip markdown before saving to DB. Preserves [CHART:X] tags. */
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
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, ''))
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
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
    }

    const firstName = (
      (user.user_metadata?.full_name as string) ||
      user.email?.split('@')[0] ||
      'Client'
    ).split(' ')[0];

    // ── Fetch history + preferences in parallel ───────────────────────────────
    const [historyResult, prefsResult] = await Promise.all([
      supabaseAdmin
        .from('conversations')
        .select('role, content')
        .eq('client_id', user.id)
        .not('role', 'is', null)
        .order('created_at', { ascending: true })
        .limit(12),
      supabaseAdmin
        .from('user_preferences')
        .select('language, level, risk_profile, currency')
        .eq('user_id', user.id)
        .single(),
    ]);

    if (historyResult.error) {
      console.error('[chat] history fetch error:', historyResult.error.message);
    }

    const history = (historyResult.data ?? []).filter((m) => m.role && m.content);
    const prefs   = prefsResult.data as {
      language?: string; level?: string; risk_profile?: string; currency?: string;
    } | null;

    const lang        = prefs?.language    ?? 'fr';
    const level       = prefs?.level       ?? 'beginner';
    const risk        = prefs?.risk_profile ?? 'moderate';
    const currency    = prefs?.currency    ?? 'CAD';
    const langLabel   = LANG_NAMES[lang]   ?? 'français';
    const isFirstMessage = history.length === 0;
    const today       = new Date().toLocaleDateString(
      lang === 'fr' ? 'fr-CA' : 'en-CA',
      { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
    );

    console.log(`[chat] user=${user.id} history=${history.length} lang=${lang} level=${level}`);

    // ── Save user message BEFORE calling Claude ───────────────────────────────
    await supabaseAdmin.from('conversations').insert({
      client_id: user.id,
      role:      'user',
      content:   message,
    });

    // ── System prompt ─────────────────────────────────────────────────────────
    const systemPrompt = `Tu es FinanceAI, le conseiller financier personnel autonome de ${firstName}.

PERSONNALITÉ :
- Tu parles comme un vrai conseiller humain qui connaît son client depuis longtemps : chaleureux, direct, jamais condescendant.
- Tu vas droit au but${level === 'expert' ? ` — ${firstName} maîtrise le vocabulaire technique.` : ', pas de jargon inutile.'}
- Tu réponds uniquement en ${langLabel}.
- Pas de listes à puces, pas de titres markdown — du texte naturel, comme si tu parlais en face à face.

RÈGLE ABSOLUE INVIOLABLE — SALUTATIONS (s'applique à TOUS les messages, TOUJOURS) :
Il est STRICTEMENT INTERDIT de commencer une réponse par Salut, Bonjour, Bonsoir, Hey, Bienvenue, Salut ${firstName}, Bonjour ${firstName}, ou n'importe quelle salutation, formule de politesse ou mot d'accueil. La PREMIÈRE PHRASE doit TOUJOURS être directement le contenu de la réponse. Zéro exception. Zéro salutation. Zéro "comment vas-tu". Commence IMMÉDIATEMENT par l'information.${isFirstMessage ? ` Si c'est le premier échange, tu peux utiliser le prénom ${firstName} naturellement dans la première phrase de contenu, mais pas comme salutation.` : ''}
Ne dis jamais "Bien sûr !", "Absolument !", "Certainement !", "Avec plaisir !", "Bien entendu !" en début de réponse.

RÈGLE CRITIQUE — CONTEXTE VISUEL (PRIORITÉ ABSOLUE) :
Si un graphique TradingView est affiché dans la conversation (indiqué par [CHART:BTC], [CHART:SOL], [CHART:AAPL actuellement affiché], etc. dans les messages), tu SAIS exactement de quel actif l'utilisateur parle. NE JAMAIS demander de clarification sur l'actif quand un graphique est visible. Utilise directement le ticker du graphique affiché pour répondre. Exemple : si [CHART:BTC actuellement affiché] est dans le message et l'utilisateur demande "ça va monter ?", réponds immédiatement sur Bitcoin sans aucune question.

INTERDIT — COMMENTAIRES SUR L'HUMEUR :
INTERDIT de commenter l'humeur ou le ton de l'utilisateur. Ne jamais dire "je vois que tu es de bonne humeur", "tu as l'air enthousiaste", "je sens que tu es inquiet", ou tout commentaire sur l'attitude, le ton, ou l'état émotionnel perçu. Traite UNIQUEMENT le contenu factuel de la question.

CONTEXTE — RÉSOLUTION DES PRONOMS :
Quand l'utilisateur dit "ça", "sa", "il", "elle", "it", "this", "c'est quoi" ou utilise un pronom vague sans préciser l'actif, réfère-toi TOUJOURS au dernier actif financier mentionné dans la conversation (action, crypto, indice, ETF). Ne JAMAIS demander de clarification si un actif a déjà été mentionné dans les 12 derniers messages. Infère directement et réponds.

RAISONNEMENT AUTONOME :
- Avant de répondre, réfléchis à quelles informations tu as besoin.
- Utilise les outils pour obtenir des données réelles. Ne JAMAIS inventer un chiffre, un prix, un fait.
- Pour une question sur le portefeuille → get_user_portfolio + calculate_portfolio_performance
- Pour un prix → get_stock_price (ou web_search si Yahoo échoue)
- Pour une décision d'investissement → get_user_portfolio + get_client_profile + get_stock_price
- Pour des actualités → get_recent_news ou web_search
- Pour comprendre le marché → get_agent_memory
- Pour l'état émotionnel → detect_user_mood en début de conversation

CONNAISSANCE DU CLIENT :
- Profil de ${firstName} : risque ${risk}, niveau ${level}, devise ${currency}.
- Si tu apprends quelque chose d'important sur ses objectifs, peurs ou préférences → save_client_insight.

GRAPHIQUES :
- Quand tu mentionnes une action ou crypto, termine par [CHART:SYMBOLE] (ex: [CHART:AAPL], [CHART:BTC-USD]).

SYSTÈME :
- Un agent Python tourne 24/7, analyse les marchés toutes les heures, sauvegarde des insights dans agent_memory.
- Date actuelle : ${today}.`;

    // ── SSE Stream setup ──────────────────────────────────────────────────────
    const encoder = new TextEncoder();
    const userId  = user.id;

    const readable = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown> | string) => {
          const payload = typeof data === 'string' ? data : JSON.stringify(data);
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        };

        try {
          // Build initial messages array for Claude
          const messages: Anthropic.MessageParam[] = [
            ...history.map((m) => ({
              role:    m.role as 'user' | 'assistant',
              content: m.content as string,
            })),
            { role: 'user', content: message },
          ];

          const MAX_ITERATIONS = 3;
          let finalAssistantText = '';

          // ── ReAct loop ────────────────────────────────────────────────────
          for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
            const stream = anthropic.messages.stream({
              model:     'claude-haiku-4-5',
              max_tokens: 800,
              system:    systemPrompt,
              tools:     ALL_TOOLS,
              messages,
            });

            // Stream text deltas to client in real time
            for await (const chunk of stream) {
              if (
                chunk.type === 'content_block_delta' &&
                chunk.delta.type === 'text_delta'
              ) {
                finalAssistantText += chunk.delta.text;
                send({ text: chunk.delta.text });
              }
            }

            // Get the complete response after streaming
            const finalMsg = await stream.finalMessage();

            // Append assistant turn to messages for next iteration
            messages.push({ role: 'assistant', content: finalMsg.content });

            // ── Done — no more tool calls ─────────────────────────────────
            if (finalMsg.stop_reason === 'end_turn' || finalMsg.stop_reason === 'max_tokens') {
              break;
            }

            // ── Tool use — execute and loop ───────────────────────────────
            if (finalMsg.stop_reason === 'tool_use') {
              const toolUseBlocks = finalMsg.content.filter(
                (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
              );

              const toolResults: Anthropic.ToolResultBlockParam[] = [];

              for (const toolCall of toolUseBlocks) {
                // Server-side tools (web_search) are handled by Anthropic — no execution needed
                if (toolCall.name === 'web_search') {
                  send({ type: 'tool_start', name: 'web_search' });
                  send({ type: 'tool_end',   name: 'web_search', success: true });
                  continue;
                }

                send({ type: 'tool_start', name: toolCall.name });

                let result: unknown;
                try {
                  result = await executeToolByName(
                    toolCall.name,
                    (toolCall.input as Record<string, unknown>) ?? {},
                    userId
                  );
                  send({ type: 'tool_end', name: toolCall.name, success: true });
                } catch (e) {
                  result = { error: String(e) };
                  send({ type: 'tool_end', name: toolCall.name, success: false });
                  console.error(`[chat] tool error [${toolCall.name}]:`, e);
                }

                toolResults.push({
                  type:        'tool_result',
                  tool_use_id: toolCall.id,
                  content:     JSON.stringify(result),
                });
              }

              // Feed results back to Claude for the next iteration
              if (toolResults.length > 0) {
                messages.push({ role: 'user', content: toolResults });
              } else {
                // All tools were server-side — Claude already has results, break
                break;
              }
            } else {
              // Unknown stop reason
              break;
            }
          }

          // ── Save assistant response ───────────────────────────────────────
          if (finalAssistantText) {
            const clean = stripMarkdown(finalAssistantText);
            const { error: saveErr } = await supabaseAdmin.from('conversations').insert({
              client_id: userId,
              role:      'assistant',
              content:   clean,
            });
            if (saveErr) {
              console.error('[chat] save error:', saveErr.message, saveErr.code);
            } else {
              console.log(`[chat] saved — user=${userId} chars=${clean.length}`);
            }
          }

          send('[DONE]');

        } catch (error) {
          console.error('[chat] ReAct loop error:', error);
          send({ type: 'error', message: 'Erreur serveur' });
          send('[DONE]');
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
