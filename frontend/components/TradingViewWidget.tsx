'use client';

import { useEffect, useRef } from 'react';
import { useLanguage } from '@/lib/language-context';

// ── TradingView global type declaration ──────────────────────────────────────
declare global {
  interface Window {
    TradingView?: {
      widget: new (options: Record<string, unknown>) => unknown;
    };
  }
}

// ── Script loader (singleton promise, loaded once per page) ──────────────────
let _scriptPromise: Promise<void> | null = null;

function loadTVScript(): Promise<void> {
  if (typeof window !== 'undefined' && window.TradingView) return Promise.resolve();
  if (_scriptPromise) return _scriptPromise;
  _scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://s3.tradingview.com/tv.js';
    s.async = true;
    s.onload  = () => resolve();
    s.onerror = () => reject(new Error('TradingView failed to load'));
    document.head.appendChild(s);
  });
  return _scriptPromise;
}

// ── Unique container ID per mount ────────────────────────────────────────────
let _counter = 0;
function nextId() { return `tv_${++_counter}_${Date.now()}`; }

// ── TradingView locale map ───────────────────────────────────────────────────
const TV_LOCALE: Record<string, string> = {
  fr: 'fr', en: 'en', es: 'es', ru: 'ru', ro: 'en',
};

// ── Props ────────────────────────────────────────────────────────────────────
export interface TradingViewWidgetProps {
  /** Already-formatted TradingView symbol, e.g. "NASDAQ:AAPL" or "BINANCE:BTCUSDT" */
  tvSymbol: string;
  height?: number;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function TradingViewWidget({ tvSymbol, height = 400 }: TradingViewWidgetProps) {
  const { lang } = useLanguage();
  const wrapRef  = useRef<HTMLDivElement>(null);
  const idRef    = useRef<string>(nextId());

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !tvSymbol) return;

    // Assign a fresh ID for this mount so TradingView can find it in the DOM
    idRef.current = nextId();

    // Clear any previous widget
    wrap.innerHTML = '';

    // Inner div: TradingView targets this element by ID
    const inner = document.createElement('div');
    inner.id = idRef.current;
    // autosize:true needs explicit CSS dimensions on the container
    inner.style.cssText = `width:100%;height:${height}px;`;
    wrap.appendChild(inner);

    const locale = TV_LOCALE[lang] ?? 'en';
    let cancelled = false;

    loadTVScript()
      .then(() => {
        // Guard: component may have unmounted while script was loading
        if (cancelled || !wrap.isConnected || !window.TradingView) return;
        // Guard: inner div must still exist in the DOM
        if (!document.getElementById(idRef.current)) return;

        new window.TradingView.widget({
          autosize:            true,   // fills the container; no need for explicit width/height
          symbol:              tvSymbol,
          interval:            'D',
          timezone:            'exchange',
          theme:               'light',
          style:               '1',
          locale,
          toolbar_bg:          '#ffffff',
          enable_publishing:   false,
          allow_symbol_change: false,
          withdateranges:      true,
          hide_side_toolbar:   true,
          save_image:          false,
          container_id:        idRef.current,
        });
      })
      .catch((err) => console.warn('TradingView widget error:', err));

    return () => {
      cancelled = true;
      if (wrap) wrap.innerHTML = '';
    };
  }, [tvSymbol, height, lang]);

  return (
    <div
      ref={wrapRef}
      style={{ width: '100%', height, minHeight: height }}
    />
  );
}
