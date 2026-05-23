/**
 * Resolves any symbol string to a TradingView-formatted symbol.
 * e.g. "AAPL" → "NASDAQ:AAPL", "bitcoin" → "BINANCE:BTCUSDT", "BTC-USD" → "BINANCE:BTCUSDT"
 */
import { STOCKS } from './stocks';

// ── Top crypto mappings ──────────────────────────────────────────────────────
// Key: lowercase ticker OR CoinGecko ID   Value: TradingView symbol
const CRYPTO_TV: Record<string, string> = {
  // by ticker
  'btc':      'BINANCE:BTCUSDT',
  'eth':      'BINANCE:ETHUSDT',
  'bnb':      'BINANCE:BNBUSDT',
  'sol':      'BINANCE:SOLUSDT',
  'xrp':      'BINANCE:XRPUSDT',
  'ada':      'BINANCE:ADAUSDT',
  'doge':     'BINANCE:DOGEUSDT',
  'dot':      'BINANCE:DOTUSDT',
  'avax':     'BINANCE:AVAXUSDT',
  'matic':    'BINANCE:MATICUSDT',
  'link':     'BINANCE:LINKUSDT',
  'uni':      'BINANCE:UNIUSDT',
  'atom':     'BINANCE:ATOMUSDT',
  'ltc':      'BINANCE:LTCUSDT',
  'etc':      'BINANCE:ETCUSDT',
  'xlm':      'BINANCE:XLMUSDT',
  'algo':     'BINANCE:ALGOUSDT',
  'icp':      'BINANCE:ICPUSDT',
  'fil':      'BINANCE:FILUSDT',
  'hbar':     'BINANCE:HBARUSDT',
  'apt':      'BINANCE:APTUSDT',
  'arb':      'BINANCE:ARBUSDT',
  'op':       'BINANCE:OPUSDT',
  'near':     'BINANCE:NEARUSDT',
  'sui':      'BINANCE:SUIUSDT',
  'sei':      'BINANCE:SEIUSDT',
  'inj':      'BINANCE:INJUSDT',
  'tia':      'BINANCE:TIAUSDT',
  'jup':      'BINANCE:JUPUSDT',
  'wif':      'BINANCE:WIFUSDT',
  'pepe':     'BINANCE:PEPEUSDT',
  'shib':     'BINANCE:SHIBUSDT',
  'trx':      'BINANCE:TRXUSDT',
  'ton':      'BINANCE:TONUSDT',
  // by CoinGecko ID
  'bitcoin':          'BINANCE:BTCUSDT',
  'ethereum':         'BINANCE:ETHUSDT',
  'binancecoin':      'BINANCE:BNBUSDT',
  'solana':           'BINANCE:SOLUSDT',
  'ripple':           'BINANCE:XRPUSDT',
  'cardano':          'BINANCE:ADAUSDT',
  'dogecoin':         'BINANCE:DOGEUSDT',
  'polkadot':         'BINANCE:DOTUSDT',
  'avalanche-2':      'BINANCE:AVAXUSDT',
  'matic-network':    'BINANCE:MATICUSDT',
  'chainlink':        'BINANCE:LINKUSDT',
  'uniswap':          'BINANCE:UNIUSDT',
  'cosmos':           'BINANCE:ATOMUSDT',
  'litecoin':         'BINANCE:LTCUSDT',
  'stellar':          'BINANCE:XLMUSDT',
  'near-protocol':    'BINANCE:NEARUSDT',
  'toncoin':          'BINANCE:TONUSDT',
  'shiba-inu':        'BINANCE:SHIBUSDT',
  'tron':             'BINANCE:TRXUSDT',
  'aptos':            'BINANCE:APTUSDT',
  'arbitrum':         'BINANCE:ARBUSDT',
  'optimism':         'BINANCE:OPUSDT',
  'injective-protocol': 'BINANCE:INJUSDT',
};

// ── Main resolver ────────────────────────────────────────────────────────────

/**
 * @param raw   The raw symbol as stored / typed by Claude (e.g. "AAPL", "bitcoin", "BTC-USD")
 * @param type  Optional hint: 'stock' | 'crypto'
 */
export function toTVSymbol(raw: string, type?: 'stock' | 'crypto'): string {
  if (!raw) return 'NASDAQ:SPY';

  const lower = raw.toLowerCase().trim();
  const upper = raw.toUpperCase().trim();

  // ── 1. Already TV-formatted (contains colon) ──────────────────────────────
  if (raw.includes(':')) return raw;

  // ── 2. Known crypto hint or pattern ──────────────────────────────────────
  if (type === 'crypto') return cryptoToTV(lower, upper);

  // ── 3. Crypto suffix patterns like BTC-USD, ETH-USD, SOL-USD, BTCUSDT ────
  const cryptoSuffixMatch = lower.match(/^([a-z0-9]+)[-/]?(usd|usdt|usdc)$/);
  if (cryptoSuffixMatch) {
    const ticker = cryptoSuffixMatch[1];
    if (CRYPTO_TV[ticker]) return CRYPTO_TV[ticker];
    return `BINANCE:${ticker.toUpperCase()}USDT`;
  }

  // ── 4. Look up in STOCKS array ────────────────────────────────────────────
  const stock = STOCKS.find(
    (s) => s.symbol.toUpperCase() === upper || s.symbol.toUpperCase().replace('.TO', '') === upper
  );
  if (stock) {
    const cleanSym = stock.symbol.replace('.TO', '').replace('-', '.');
    return `${stock.exchange}:${cleanSym}`;
  }

  // ── 5. TSX pattern: symbol ending with .TO ────────────────────────────────
  if (upper.endsWith('.TO')) {
    return `TSX:${upper.replace('.TO', '')}`;
  }

  // ── 6. Known crypto ticker (bare, without suffix) ─────────────────────────
  if (CRYPTO_TV[lower]) return CRYPTO_TV[lower];

  // ── 7. Fallback: bare ticker — TradingView auto-resolves the correct exchange
  //    (NYSE:PII, AMEX:X, etc.) without needing us to guess
  return upper;
}

function cryptoToTV(lower: string, upper: string): string {
  // Direct map lookup
  if (CRYPTO_TV[lower]) return CRYPTO_TV[lower];
  // Strip -USD suffix
  const stripped = lower.replace(/-?(usd|usdt|usdc)$/, '');
  if (CRYPTO_TV[stripped]) return CRYPTO_TV[stripped];
  // Build generic BINANCE pair
  const ticker = stripped || upper;
  return `BINANCE:${ticker.toUpperCase().replace('-', '').replace('/', '')}USDT`;
}
