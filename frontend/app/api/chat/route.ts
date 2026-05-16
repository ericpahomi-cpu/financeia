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

    const userName = (user.user_metadata?.full_name as string) || user.email?.split('@')[0] || 'Client';

    // Fetch conversation history for Claude context (before saving new message)
    const { data: history } = await supabaseAdmin
      .from('conversations')
      .select('role, content')
      .eq('client_id', user.id)
      .order('created_at', { ascending: true })
      .limit(50);

    const isFirstConversation = !history || history.length === 0;

    const systemPrompt = isFirstConversation
      ? `Tu es FinanceAI, un conseiller financier personnel expert. C'est la première fois que ${userName} utilise FinanceAI. Commence par te présenter chaleureusement et pose-lui ces 3 questions pour apprendre à le connaître : 1) Quel est son profil de risque (prudent, modéré ou dynamique) ? 2) Quels sont ses actifs ou marchés favoris (actions, crypto, ETF...) ? 3) Quels sont ses objectifs financiers (épargne, retraite, spéculation...) ?

Tu cherches toujours les données financières les plus récentes sur le web avant de répondre. Tes réponses sont en français, claires et directes — jamais de markdown, jamais de ##, **, ou *. Tu écris comme un conseiller humain. Maximum 3-4 paragraphes par réponse.`
      : `Tu es FinanceAI, un conseiller financier personnel expert de ${userName}. Tu te souviens de toutes tes conversations passées avec ce client. Utilise cet historique pour personnaliser tes réponses et appeler le client par son prénom. Tu connais ses préférences, son profil de risque et ses objectifs financiers mentionnés dans les conversations passées.

Tu cherches toujours les données financières les plus récentes sur le web avant de répondre. Tes réponses sont en français, claires et directes — jamais de markdown, jamais de ##, **, ou *. Tu écris comme un conseiller humain. Maximum 3-4 paragraphes par réponse. Tu bases tes conseils uniquement sur les données actuelles du marché.`;

    const claudeMessages: { role: 'user' | 'assistant'; content: string }[] = [
      ...(history || []).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content as string,
      })),
      { role: 'user', content: message },
    ];

    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
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
          // Save both messages after stream completes
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
