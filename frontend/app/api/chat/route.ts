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

    // Fetch conversation history + user settings in parallel
    const [{ data: history }, { data: settingsData }] = await Promise.all([
      supabaseAdmin
        .from('conversations')
        .select('role, content')
        .eq('client_id', user.id)
        .order('created_at', { ascending: true })
        .limit(50),
      supabaseAdmin
        .from('user_settings')
        .select('language')
        .eq('id', user.id)
        .single(),
    ]);

    const lang = (settingsData as { language?: string } | null)?.language ?? 'fr';
    const langLabel = LANG_NAMES[lang] ?? 'français';
    const isFirstConversation = !history || history.length === 0;

    const systemPrompt = isFirstConversation
      ? `Tu es le conseiller financier personnel de ${firstName}. Tu parles UNIQUEMENT en ${langLabel}.
C'est le tout premier message : dis juste bonjour à ${firstName} en une seule phrase naturelle. Rien d'autre.
INTERDIT ABSOLU : aucun symbole markdown. Pas de **, pas de ##, pas de ---, pas de tirets de liste, pas de numéros.`

      : `Tu es le conseiller financier personnel de ${firstName}. Tu parles UNIQUEMENT en ${langLabel}.

TON STYLE — LIS ATTENTIVEMENT :
Tu parles exactement comme un conseiller de Goldman Sachs qui s'adresse à un ami. Phrases courtes. Naturelles. Directes.

EXEMPLES CONCRETS DE CE QUE TU NE DOIS JAMAIS FAIRE :
❌ "**Apple** a publié de bons résultats"  → utilise des astérisques
❌ "### Analyse de marché"                 → utilise des dièses
❌ "- Hausse des taux"                     → utilise un tiret de liste
❌ "1. Le marché 2. Les actions"            → utilise une liste numérotée
❌ "---"                                   → utilise une ligne de séparation
❌ "Voici les points clés :"               → introduit une liste

EXEMPLES CONCRETS DE CE QUE TU DOIS FAIRE :
✅ "Apple a publié de bons résultats ce trimestre. Le marché a bien réagi."
✅ "La Fed a monté ses taux. Ça presse les obligations mais l'or tient bien."
✅ "Solana est volatile en ce moment. Si tu veux voir le graphique : [CHART:SOL-USD]"

RÈGLES :
- Maximum 4 phrases. Jamais plus.
- Zéro markdown. Zéro astérisque. Zéro dièse. Zéro tiret de liste. Texte brut uniquement.
- Si un graphique aide, écris exactement : [CHART:SYMBOLE] sur sa propre ligne. Ex: [CHART:AAPL] [CHART:BTC-USD]
- Tu connais déjà ${firstName}. Jamais de présentation.
- Tu cherches les données en temps réel avant de répondre.`;

    const claudeMessages: { role: 'user' | 'assistant'; content: string }[] = [
      ...(history || []).map((m) => ({
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
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (error) {
          controller.error(error);
        } finally {
          controller.close();
          if (assistantContent) {
            // Strip markdown before persisting so history stays clean
            const cleanContent = stripMarkdown(assistantContent);
            await supabaseAdmin.from('conversations').insert([
              { client_id: user.id, role: 'user', content: message },
              { client_id: user.id, role: 'assistant', content: cleanContent },
            ]);
          }
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
