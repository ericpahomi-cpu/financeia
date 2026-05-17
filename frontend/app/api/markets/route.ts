import { NextRequest, NextResponse } from 'next/server';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Quote {
  symbol: string; name: string; price: number;
  change: number; changePct: number; currency: string;
  volume: number | null; marketCap: number | null;
}

// ── Crumb cache (reused across warm serverless invocations) ───────────────────
let _crumbCache: { crumb: string; cookie: string; exp: number } | null = null;

async function getCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  // Return cached crumb if still valid
  if (_crumbCache && Date.now() < _crumbCache.exp) {
    return { crumb: _crumbCache.crumb, cookie: _crumbCache.cookie };
  }
  try {
    // Step 1 — visit fc.yahoo.com to get a session cookie
    const r1 = await fetch('https://fc.yahoo.com', {
      headers: { 'User-Agent': UA },
      redirect: 'follow',
    });
    const cookie = r1.headers.get('set-cookie') ?? '';
    if (!cookie) {
      console.error('[markets] No cookie from fc.yahoo.com');
      return null;
    }

    // Step 2 — exchange the cookie for a crumb
    const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, Cookie: cookie },
    });
    if (!r2.ok) {
      console.error('[markets] getcrumb failed:', r2.status);
      return null;
    }
    const crumb = (await r2.text()).trim();
    console.log('[markets] crumb refreshed:', crumb.slice(0, 6) + '…');

    // Cache for 55 minutes (crumb validity is ~1 h)
    _crumbCache = { crumb, cookie, exp: Date.now() + 55 * 60 * 1000 };
    return { crumb, cookie };
  } catch (e) {
    console.error('[markets] getCrumb exception:', e);
    return null;
  }
}

// ── Strategy A — v7 batch (1 request for N symbols) ─────────────────────────
async function fetchV7(symbols: string): Promise<Quote[]> {
  const auth = await getCrumb();
  if (!auth) throw new Error('no crumb');

  const url =
    `https://query1.finance.yahoo.com/v7/finance/quote` +
    `?symbols=${encodeURIComponent(symbols)}&formatted=false&lang=en&region=US` +
    `&crumb=${encodeURIComponent(auth.crumb)}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json', Cookie: auth.cookie },
    // no Next.js cache — we handle freshness ourselves via the crumb cache
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[markets] v7 ${res.status}:`, body.slice(0, 300));
    throw new Error(`v7 ${res.status}`);
  }

  const data = await res.json() as {
    quoteResponse: {
      result: Array<{
        symbol: string; shortName?: string; longName?: string;
        regularMarketPrice: number; regularMarketChangePercent: number;
        regularMarketChange: number; currency: string;
        regularMarketVolume?: number; marketCap?: number;
      }>;
    };
  };

  return (data.quoteResponse?.result ?? []).map((q) => ({
    symbol:    q.symbol,
    name:      q.shortName || q.longName || q.symbol,
    price:     q.regularMarketPrice,
    change:    q.regularMarketChange,
    changePct: q.regularMarketChangePercent,
    currency:  q.currency,
    volume:    q.regularMarketVolume ?? null,
    marketCap: q.marketCap ?? null,
  }));
}

// ── Strategy B — v8 chart per symbol (fallback, parallel) ────────────────────
async function fetchV8One(symbol: string): Promise<Quote | null> {
  try {
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?interval=1d&range=2d&includePrePost=false`;

    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      cache: 'no-store',
    });

    if (!res.ok) {
      console.warn(`[markets] v8 ${symbol} → ${res.status}`);
      return null;
    }

    const data = await res.json() as {
      chart: { result: Array<{ meta: {
        symbol: string; shortName?: string; currency: string;
        regularMarketPrice: number; chartPreviousClose?: number;
        previousClose?: number; regularMarketVolume?: number;
      } }> };
    };

    const m = data.chart?.result?.[0]?.meta;
    if (!m) { console.warn(`[markets] v8 ${symbol}: empty result`); return null; }

    const price = m.regularMarketPrice ?? 0;
    const prev  = m.chartPreviousClose ?? m.previousClose ?? 0;
    const change    = prev ? price - prev : 0;
    const changePct = prev ? (change / prev) * 100 : 0;

    return {
      symbol:    m.symbol ?? symbol,
      name:      m.shortName ?? symbol,
      price,
      change,
      changePct,
      currency:  m.currency ?? 'USD',
      volume:    m.regularMarketVolume ?? null,
      marketCap: null,
    };
  } catch (e) {
    console.error(`[markets] v8 ${symbol} exception:`, e);
    return null;
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const symbols = new URL(req.url).searchParams.get('symbols') ?? '';
  if (!symbols) return NextResponse.json({ quotes: [] });

  // Try v7 batch first (fast: 1 request for all symbols)
  try {
    const quotes = await fetchV7(symbols);
    if (quotes.length > 0) {
      console.log(`[markets] v7 OK — ${quotes.length} quotes`);
      return NextResponse.json({ quotes });
    }
  } catch (e) {
    console.warn('[markets] v7 failed, switching to v8 fallback:', (e as Error).message);
  }

  // Fallback: parallel v8 chart requests per symbol
  const syms   = symbols.split(',').map((s) => s.trim()).filter(Boolean);
  const quotes  = (await Promise.all(syms.map(fetchV8One))).filter((q): q is Quote => q !== null);
  console.log(`[markets] v8 fallback — ${quotes.length}/${syms.length} quotes`);
  return NextResponse.json({ quotes });
}
