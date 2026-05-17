import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';

const NEWS_API_KEY = process.env.NEWS_API_KEY!;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const supabaseAdmin = createSupabaseAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const QUERIES: Record<string, string> = {
  all:       'finance OR economy OR markets OR stocks OR crypto OR Canada economy',
  politique: 'politics economy policy government Canada USA Federal Reserve Bank of Canada',
  economie:  'GDP inflation employment economy Canada USA recession growth',
  marches:   'stock market NYSE NASDAQ TSX S&P 500 earnings trading',
  banques:   'Federal Reserve Bank of Canada interest rates central bank monetary policy',
};

interface Article {
  title: string; description: string; url: string;
  source: string; publishedAt: string; image: string;
}

export async function GET(req: NextRequest) {
  const category = new URL(req.url).searchParams.get('category') || 'all';

  try {
    // 1. Try news_cache first (articles fetched in the last 30 min)
    const since = new Date(Date.now() - CACHE_TTL_MS).toISOString();
    const { data: cached } = await supabaseAdmin
      .from('news_cache')
      .select('title, description, url, source, published_at, image')
      .eq('category', category)
      .gte('fetched_at', since)
      .order('published_at', { ascending: false })
      .limit(30);

    if (cached && cached.length > 0) {
      const articles: Article[] = cached.map((a) => ({
        title:       a.title,
        description: a.description || '',
        url:         a.url,
        source:      a.source,
        publishedAt: a.published_at,
        image:       a.image,
      }));
      return NextResponse.json({ articles, fromCache: true });
    }
  } catch {
    // Supabase unavailable — fall through to NewsAPI
  }

  // 2. Fall back to live NewsAPI fetch
  const q = QUERIES[category] ?? QUERIES.all;
  try {
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=publishedAt&pageSize=30&apiKey=${NEWS_API_KEY}`;
    const res = await fetch(url, { next: { revalidate: 900 } });
    if (!res.ok) throw new Error('NewsAPI error');

    const data = await res.json() as {
      articles: Array<{
        title: string; description: string; url: string;
        source: { name: string }; publishedAt: string; urlToImage: string;
      }>;
    };

    const articles: Article[] = (data.articles || [])
      .filter((a) => a.title && a.title !== '[Removed]')
      .map((a) => ({
        title:       a.title,
        description: a.description || '',
        url:         a.url,
        source:      a.source.name,
        publishedAt: a.publishedAt,
        image:       a.urlToImage,
      }));

    // Store in cache asynchronously (don't await — don't block response)
    if (articles.length > 0) {
      void Promise.resolve(
        supabaseAdmin.from('news_cache').insert(
          articles.map((a) => ({
            category,
            title:        a.title,
            description:  a.description,
            url:          a.url,
            source:       a.source,
            published_at: a.publishedAt,
            image:        a.image,
          }))
        )
      );
    }

    return NextResponse.json({ articles, fromCache: false });
  } catch {
    return NextResponse.json({ articles: [] });
  }
}
