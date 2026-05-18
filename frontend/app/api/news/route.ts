import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';

const supabaseAdmin = createSupabaseAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 2 h — matches agent refresh cycle (30 min) with comfortable buffer
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

// Valid category keys stored by the agent
const VALID_CATEGORIES = ['politique', 'economie', 'marches', 'banques'] as const;
type Category = typeof VALID_CATEGORIES[number] | 'all';

export async function GET(req: NextRequest) {
  const raw      = new URL(req.url).searchParams.get('category') ?? 'all';
  const category = (VALID_CATEGORIES.includes(raw as never) || raw === 'all') ? raw as Category : 'all';
  const since    = new Date(Date.now() - CACHE_TTL_MS).toISOString();

  try {
    // Build query — 'all' shows everything regardless of category
    let query = supabaseAdmin
      .from('news_cache')
      .select('title, description, url, source, published_at, image, category')
      .gte('fetched_at', since)
      .order('published_at', { ascending: false })
      .limit(40);

    if (category !== 'all') {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[news] Supabase error:', error.message);
      return NextResponse.json({ articles: [], fromCache: false });
    }

    const articles = (data ?? []).map((a) => ({
      title:       a.title,
      description: a.description ?? '',
      url:         a.url,
      source:      a.source,
      publishedAt: a.published_at,
      image:       a.image ?? '',
      category:    a.category,
    }));

    return NextResponse.json({ articles, fromCache: articles.length > 0 });
  } catch (e) {
    console.error('[news] Unexpected error:', e);
    return NextResponse.json({ articles: [], fromCache: false });
  }
}
