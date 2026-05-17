import { NextRequest, NextResponse } from 'next/server';

const NEWS_API_KEY = process.env.NEWS_API_KEY!;

export async function GET(req: NextRequest) {
  const category = new URL(req.url).searchParams.get('category') || 'all';

  const queries: Record<string, string> = {
    all:          'finance OR economy OR markets OR stocks OR crypto OR Canada economy',
    politique:    'politics economy policy government Canada USA Federal Reserve Bank of Canada',
    economie:     'GDP inflation employment economy Canada USA recession growth',
    marches:      'stock market NYSE NASDAQ TSX S&P 500 earnings trading',
    banques:      'Federal Reserve Bank of Canada interest rates central bank monetary policy',
  };

  const q = queries[category] || queries.all;

  try {
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=publishedAt&pageSize=30&apiKey=${NEWS_API_KEY}`;
    const res = await fetch(url, { next: { revalidate: 900 } }); // cache 15 min
    if (!res.ok) throw new Error('NewsAPI error');

    const data = await res.json() as {
      articles: Array<{
        title: string; description: string; url: string;
        source: { name: string }; publishedAt: string; urlToImage: string;
      }>;
    };

    const articles = (data.articles || [])
      .filter((a) => a.title && a.title !== '[Removed]')
      .map((a) => ({
        title:       a.title,
        description: a.description || '',
        url:         a.url,
        source:      a.source.name,
        publishedAt: a.publishedAt,
        image:       a.urlToImage,
      }));

    return NextResponse.json({ articles });
  } catch {
    return NextResponse.json({ articles: [] });
  }
}
