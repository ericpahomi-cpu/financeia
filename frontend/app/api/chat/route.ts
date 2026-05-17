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

/**
 * Strip all markdown from a string before storing in DB or sending to client.
 * Preserves [CHART:X] tags (they don't match any markdown pattern).
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')              // ## Titre → Titre
    .replace(/\*\*\*([\s\S]+?)\*\*\*/g, '$1')  // ***texte*** → texte
    .replace(/\*\*([\s\S]+?)\*\*/g, '$1')      // **gras** → gras
    .replace(/\*([\s\S]+?)\*/g, '$1')          // *italique* → italique
    .replace(/_{2}([\s\S]+?)_{2}/g, '$1')      // __gras__ → gras
    .replace(/_([^_\n]+)_/g, '$1')             // _italique_ → italique
    .replace(/^\s*[-*+]\s+/gm, '')             // - bullet → (retire le tiret)
    .replace(/^\s*\d+\.\s+/gm, '')             // 1. item → (retire le numéro)
    .replace(/^-{3,}\s*$/gm, '')               // --- → (retire la ligne)
    .replace(/^={3,}\s*$/gm, '')               // === → (retire la ligne)
    .replace(/```[\s\S]*?```/g, (m) =>         // ```code``` → juste le code
      m.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, ''))
    .replace(/`([^`\n]+)`/g, '$1')             // `code` → code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')   // [lien](url) → lien
    .replace(/\n{3,}/g, '\n\n')                // 3+ sauts → 2
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();

    if (!message) {
      return new Response(JSON.stringify({ error: 'Message requis' }), { status: 400 });
    }

    // Authenticate user
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
    }

    const firstName = ((user.user_metadata?.full_name as string) || user.email?.split('@')[0] || 'Client').split(' ')[0];

    // Fetch last 20 messages (10 exchanges) + user settings in parallel
    const [{ data: historyRaw }, { data: settingsData }] = await Promise.all([
      supabaseAdmin
        .from('conversations')
        .select('role, content')
        .eq('client_id', user.id)
        .order('created_at', { ascending: false }) // newest first
        .limit(20),
      supabaseAdmin
        .from('user_settings')
        .select('language')
        .eq('id', user.id)
        .single(),
    ]);

    // Reverse so messages are chronological (oldest → newest) for Claude
    const history = historyRaw ? [...historyRaw].reverse() : [];

    const lang = (settingsData as { language?: string } | null)?.language ?? 'fr';
    const langLabel = LANG_NAMES[lang] ?? 'français';
    const isFirstConversation = history.length === 0;

    const systemPrompt = isFirstConversation
      ? `Tu es le conseiller financier personnel de ${firstName}. Tu parles UNIQUEMENT en ${langLabel}.
C'est le tout premier message : dis juste bonjour à ${firstName} en une seule phrase naturelle. Rien d'autre.
INTERDIT ABSOLU : aucun symbole markdown. Pas de **, pas de ##, pas de ---, pas de tirets de liste, pas de numéros.`

      : `Tu es le conseiller financier personnel de ${firstName}. Tu parles UNIQUEMENT en ${langLabel}.

STYLE : Conseiller Goldman Sachs qui parle à un ami. Phrases courtes. Directes. Maximum 4 phrases.

INTERDIT (markdown) :
❌ **, ***, ##, ###, ---, tirets de liste, listes numérotées. Texte brut uniquement.

GRAPHIQUES — RÈGLE ABSOLUE :
Dès que tu mentionnes une action ou une crypto par son nom → tu TERMINES ta réponse par [CHART:SYMBOLE].
Ce tag est obligatoire. Sans exception.

Symboles crypto : BTC-USD, ETH-USD, SOL-USD, BNB-USD, XRP-USD, DOGE-USD, AVAX-USD, MATIC-USD, LINK-USD, ADA-USD
Symboles actions : AAPL, MSFT, TSLA, AMZN, GOOGL, NVDA, META, NFLX, SHOP, COIN

EXEMPLES OBLIGATOIRES :
"Solana a progressé de 12% cette semaine. Le momentum technique est fort. [CHART:SOL-USD]"
"Apple publie ses résultats jeudi. Le marché anticipe une surprise positive. [CHART:AAPL]"
"Bitcoin consolide autour de 95k. La tendance reste haussière. [CHART:BTC-USD]"
"Nvidia domine le marché des GPU IA. La demande reste très forte. [CHART:NVDA]"

INTERDIT ABSOLU :
❌ "Consultez coinbase.com" — l'application affiche les graphiques directement, ne renvoie JAMAIS vers un site externe
❌ "Regardez sur coinmarketcap / yahoo finance / tradingview" — même raison
❌ Répondre sans [CHART:X] quand tu parles d'un actif spécifique

Tu connais déjà ${firstName}. Jamais de présentation. Tu cherches les données en temps réel avant de répondre.`;

    const claudeMessages: { role: 'user' | 'assistant'; content: string }[] = [
      ...history.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content as string,
      })),
      { role: 'user', content: message },
    ];

    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: systemPrompt,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: claudeMessages,
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
                encoder.encode(
                  `data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`
                )
              );
            }
          }

          // ── Save to DB BEFORE sending [DONE] ────────────────────────────
          // Doing it after controller.close() risks the serverless function
          // being killed before the await resolves.
          if (assistantContent) {
            const cleanContent = stripMarkdown(assistantContent);
            const { error: insertError } = await supabaseAdmin
              .from('conversations')
              .insert([
                { client_id: user.id, role: 'user',      content: message      },
                { client_id: user.id, role: 'assistant', content: cleanContent },
              ]);
            if (insertError) {
              console.error('[chat] Erreur sauvegarde conversation:', insertError.message);
            }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (error) {
          controller.error(error);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Erreur API chat:', error);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500 });
  }
}
