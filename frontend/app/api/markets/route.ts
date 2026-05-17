import { NextRequest, NextResponse } from 'next/server';

// Yahoo Finance unofficial quote API (no key required)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbols = searchParams.get('symbols') || '';

  if (!symbols) return NextResponse.json({ quotes: [] });

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&formatted=false&lang=en&region=US`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 60 }, // cache 1 min
    });

    if (!res.ok) throw new Error('Yahoo Finance unavailable');
    const data = await res.json() as {
      quoteResponse: { result: Array<{
        symbol: string; shortName: string; longName: string;
        regularMarketPrice: number; regularMarketChangePercent: number;
        regularMarketChange: number; currency: string;
        regularMarketVolume: number; marketCap: number;
      }> };
    };

    const quotes = (data.quoteResponse?.result || []).map((q) => ({
      symbol:       q.symbol,
      name:         q.shortName || q.longName || q.symbol,
      price:        q.regularMarketPrice,
      change:       q.regularMarketChange,
      changePct:    q.regularMarketChangePercent,
      currency:     q.currency,
      volume:       q.regularMarketVolume,
      marketCap:    q.marketCap,
    }));

    return NextResponse.json({ quotes });
  } catch {
    return NextResponse.json({ quotes: [], error: 'Yahoo Finance indisponible' });
  }
}
