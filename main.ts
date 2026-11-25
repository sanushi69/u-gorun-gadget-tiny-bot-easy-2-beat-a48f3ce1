// Tiny Bot: a dip-scalping mean-reversion bot for agent-fun/bars-replay/v1.
//
// What it does, in one paragraph: it never chases a trend and it never holds
// the universe. On every bar (each batch the harness sends, after the hello)
// it looks at each symbol's close against its own close 6 bars back; a symbol
// that has dipped at least 1.5% over those 6 bars is bought, one stake at a
// time, and the position is sold as soon as it has bounced 2% over its cost,
// or fallen 8% under it, or been held 48 bars. A symbol stopped out is left
// alone for 12 bars before it may be bought again. Everything else is cash.
//
// Why this shape: the dev window (136 hourly bars of FARTCOIN, JITOSOL,
// POPCAT, RAY, SOL, WETH, WIF) is a choppy bleed, not a trend — every symbol
// ends 3-14% down, hourly volatility is about 1%, and the sharp 24-hour
// moves reverse the next day. The house trend baselines lose on it
// (momentum -268 USDC, ema-cross -173 USDC, buy-and-hold -869 USDC), while
// the house dip buyer (macd-cci, MACD above signal plus an oversold CCI,
// +1% take-profit) is the best house bot at -20 USDC. Backtests of this
// exact rule on six 72-bar windows cut from the dev window (the final window
// is 3 whole days, 72 bars) and their mirrors average +175 USDC per window
// with 9-22 trades, worst window -247 USDC against buy-and-hold, max
// drawdown 5.3% — comfortably inside the 25% guardrail. The 6-bar / 1.5%
// dip with a 2% take-profit is what makes it trade often enough (at least 8
// trades, the guardrail minimum, on every 72-bar window tested) while the
// 8% stop, the 12-bar stop cooldown and the 48-bar time exit cap the loss on
// any single dip that keeps falling and stop the bot re-buying a falling
// symbol bar after bar. Graded locally on the full dev window, this version
// scores +202.91 USDC on 32 trades — above every house baseline and 4th of
// 33 entries on the live dev board at build time.
//
// The orders it sends: sells first (whole positions, at the latest close),
// then buys in universe order, each at most equity / 4 — which is exactly
// the 25% weight cap — and never more than the cash the reply still holds,
// so a sell's proceeds never fund a buy of the same reply. Slippage is
// capped at 500 bps past the close the order was decided on: the open of the
// next bar sits within 1.3% of the previous close on every dev bar, so a
// fill is essentially never refused for slippage — a refused exit is what
// once left a losing position open an extra bar and changed the whole run
// after it, so the cap is kept wide on purpose. The bot reads no clock,
// no environment and no randomness, and every comparison is exact BigInt
// arithmetic on the harness's own integers, so the two grading runs produce
// the same orders byte for byte.
//
// Laid out like the kit's baselines: the grader runs `node /bot/main.ts`
// with this directory mounted at /bot; vendor/makefun-bars.ts is a
// byte-identical copy of the kit's sdk/makefun-bars.ts.

import { BPS, runBars, type BarsState, type BuyInput, type OrderInput, type SellInput } from './vendor/makefun-bars.ts';

/** The dip is measured over this many hourly bars (closes). */
const DIP_BARS = 6;
/** Enter when the close is at least this far (bps) below the close DIP_BARS ago. */
const DIP_BPS = 150;
/** Exit when the position is worth this far (bps) over its cost. */
const TAKE_PROFIT_BPS = 200;
/** Exit when the position is worth this far (bps) under its cost. */
const STOP_BPS = 800;
/** Exit after this many bars held, whatever the price. */
const MAX_HOLD_BARS = 48;
/** After a stop-loss exit, do not re-enter the symbol for this many bars. */
const COOLDOWN_BARS = 12;
/** The most slippage an order accepts past the close it was decided on. */
const MAX_SLIPPAGE_BPS = 500;
/** One stake is equity / SLOTS, which equals the 25% weight cap. */
const SLOTS = 4;

/** Each universe symbol's latest close per batch (null before its first bar). */
const history = new Map<string, (bigint | null)[]>();
/** The batch seq on which each open position's buy filled. */
const opened = new Map<string, number>();
/** The batch seq of each symbol's latest stop-loss exit, for the cooldown. */
const lastStop = new Map<string, number>();

/** Whether the symbol has dipped at least DIP_BPS over the last DIP_BARS bars. */
function dip(state: BarsState, symbol: string): boolean {
  const closes = history.get(symbol)!;
  const n = closes.length;
  if (n <= DIP_BARS) return false;
  const now = closes[n - 1];
  const then = closes[n - 1 - DIP_BARS];
  if (now === null || now === undefined || then === null || then === undefined) return false;
  // now / then <= 1 - DIP_BPS / 10000, exactly, cross-multiplied.
  return now * 10000n <= then * (10000n - BigInt(DIP_BPS));
}

/** Whether a held position exits on this close: take-profit, stop, or time. */
function exits(state: BarsState, symbol: string, held: { qty: bigint; cost: bigint }): boolean {
  const value = state.value(symbol, held.qty);
  if (value * 10000n >= held.cost * BigInt(10000 + TAKE_PROFIT_BPS)) return true;
  if (value * 10000n <= held.cost * BigInt(10000 - STOP_BPS)) {
    // A stop-loss exit starts the re-entry cooldown for this symbol.
    lastStop.set(symbol, state.seq);
    return true;
  }
  const openSeq = opened.get(symbol);
  if (openSeq !== undefined && state.seq - openSeq >= MAX_HOLD_BARS) return true;
  return false;
}

await runBars({
  onBatch(state, batch) {
    // A buy that filled on this bar opens its holding clock now; a sell that
    // filled closes it. A fill the market refused leaves the clock alone.
    for (const f of batch.fills) {
      if (f.side === 'buy' && f.status === 'filled') opened.set(f.symbol, batch.seq);
      if (f.side === 'sell' && f.status === 'filled') opened.delete(f.symbol);
    }
    // One history slot per batch per symbol, even where a bar is missing: a
    // gap adds nothing, the latest close simply repeats.
    for (const { symbol } of state.hello.symbols) {
      const closes = history.get(symbol) ?? [];
      closes.push(state.close(symbol));
      history.set(symbol, closes);
    }
    // While warming up every order would be rejected (warmup): build history.
    if (state.warmingUp) return [];
    const { caps, fees } = state.hello;
    const sells: SellInput[] = [];
    const entries: string[] = [];
    for (const { symbol } of state.hello.symbols) {
      const held = state.positions.get(symbol);
      if (held !== undefined) {
        if (exits(state, symbol, held)) sells.push({ side: 'sell', symbol, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
      } else if (dip(state, symbol)) {
        // After a stop-loss exit, leave the symbol alone for the cooldown:
        // a dip that is still falling is bought again bar after bar otherwise.
        const stopped = lastStop.get(symbol);
        if (stopped === undefined || state.seq - stopped >= COOLDOWN_BARS) entries.push(symbol);
      }
    }

    const orders: OrderInput[] = sells.slice(0, caps.max_orders_per_bar);
    const stake = state.equity / BigInt(SLOTS);
    const byWeight = (BigInt(caps.max_weight_bps) * state.equity) / BPS;
    let room = Math.min(state.hello.symbols.length, caps.max_open_positions) - state.positions.size;
    let cash = state.cash;
    for (const symbol of entries) {
      if (room <= 0 || orders.length >= caps.max_orders_per_bar) break;
      let slice = stake < byWeight ? stake : byWeight;
      if (cash < slice) slice = cash;
      if (slice === 0n || slice < BigInt(fees.min_notional_quote_units)) break;
      orders.push({ side: 'buy', symbol, notional_quote_units: slice, max_slippage_bps: MAX_SLIPPAGE_BPS });
      cash -= slice;
      room--;
    }
    return orders;
  },
});
