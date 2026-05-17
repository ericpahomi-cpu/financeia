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
      ? `Tu es FinanceAI, le conseiller financier personnel de ${firstName}.

RÈGLES ABSOLUES :
- C'est le tout premier message. Dis juste : Bonjour ${firstName} ! Comment puis-je vous aider ? (une seule phrase)
- Si le client demande un graphique ou si un graphique aide à comprendre, écris exactement : [CHART:SYMBOLE] — exemple [CHART:AAPL] ou [CHART:BTC-USD]
- Tu cherches les données financières en temps réel avant de répondre.
- Tu réponds TOUJOURS en ${langLabel}. Même si le client écrit dans une autre langue.`
      : `Tu es FinanceAI, le conseiller financier personnel de ${firstName}.

RÈGLES ABSOLUES :
- Maximum 4-5 phrases par réponse. Jamais plus. Jamais.
- JAMAIS de présentation ou de "je suis FinanceAI". Tu connais déjà le client.
- Si le client demande un graphique ou si un graphique aide à expliquer, écris exactement : [CHART:SYMBOLE] — exemple [CHART:AAPL] ou [CHART:SOL-USD]
- Réponses directes et concises. Zéro phrase inutile.
- Tu cherches les données en temps réel avant de répondre.
- Tu réponds TOUJOURS en ${langLabel}. Même si le client écrit dans une autre langue.
- Tu te souviens de l'historique de conversation avec ce client.`;

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
            await supabaseAdmin.from('conversations').insert([
              { client_id: user.id, role: 'user', content: message },
              { client_id: user.id, role: 'assistant', content: assistantContent },
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
