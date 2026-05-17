import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q') || '';
  if (!q) return NextResponse.json({ results: [] });

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&newsCount=0&enableFuzzyQuery=false`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json() as {
      quotes: Array<{ symbol: string; shortname: string; longname: string; exchange: string; quoteType: string }>;
    };

    const results = (data.quotes || [])
      .filter((q) => q.quoteType === 'EQUITY' || q.quoteType === 'ETF')
      .slice(0, 10)
      .map((q) => ({
        symbol:   q.symbol,
        name:     q.shortname || q.longname || q.symbol,
        exchange: q.exchange,
      }));

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
