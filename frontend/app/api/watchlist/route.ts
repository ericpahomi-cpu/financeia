import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { createClient as createAdmin } from '@supabase/supabase-js';

// Force dynamic rendering — this route makes external calls (Supabase + Anthropic)
// and must never be statically pre-rendered at build time on Vercel.
export const dynamic = 'force-dynamic';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  defaultHeaders: { 'anthropic-beta': 'web-search-2025-03-05' },
});

const admin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  // Check cache (agent_memory with category 'watchlist', max 1h old)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: cached } = await admin
    .from('agent_memory')
    .select('content, created_at')
    .eq('category', 'watchlist')
    .gte('created_at', oneHourAgo)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (cached) {
    try {
      return NextResponse.json({ watchlist: JSON.parse(cached.content), cached: true });
    } catch { /* invalid JSON, regenerate */ }
  }

  // Generate fresh watchlist
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1500,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: 'You are a financial analyst. Search the web for the latest market data and return ONLY a valid JSON array. No markdown, no explanation — raw JSON only.',
      messages: [{
        role: 'user',
        content: `Search the web for today's most interesting stocks and cryptocurrencies to watch.
Return a JSON array of exactly 8 items, each with this structure:
[
  {
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "type": "stock",
    "reason": "Short reason why to watch (max 15 words)",
    "direction": "hausse",
    "confidence": 72
  }
]
direction must be "hausse", "baisse", or "neutre". confidence is 0-100.
Return ONLY the JSON array, nothing else.`,
      }],
    });

    const text = response.content.find((b) => b.type === 'text')?.text || '[]';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const watchlist = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    // Save to cache
    if (watchlist.length > 0) {
      await admin.from('agent_memory').insert({
        content: JSON.stringify(watchlist),
        category: 'watchlist',
        importance: 7,
      });
    }

    return NextResponse.json({ watchlist, cached: false });
  } catch {
    return NextResponse.json({ watchlist: [], error: 'Analyse indisponible' });
  }
}
