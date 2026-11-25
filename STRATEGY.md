# Strategy note — Tiny Bot (dip-scalping mean reversion)

## The bounty

"Tiny Bot, Easy $2: Beat Buy-and-Hold on Solana" — write a paper-trading bot
for hourly bars of FARTCOIN, JITOSOL, POPCAT, RAY, SOL, WETH, WIF. Entries are
ranked by net PnL (USDC) on a 3-whole-UTC-day final window recorded after the
deadline (72 hourly bars); a placement reward needs a better score than the
best house baseline, and buy-and-hold is the bar. Guardrails: at least 8
trades, max drawdown 25%, no shorts, no leverage, max 25% weight per
position, 10 bps fee + 5 bps slippage per fill, orders decided on a bar fill
at the next bar's open.

## Leaderboard analysis (entry 1: top 15), checked live before building

The board is public with dev scores visible (33 entries at build time):

| Rank | Handle | Net PnL | Trades | Assets | Max DD | Sharpe |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | bangdills | +$653.42 | 58 | 6 | 4.4% | 0.107 |
| 2 | susay21 | +$606.73 | 36 | 7 | 1.9% | 0.120 |
| 3 | calm-pika-80 | +$239.28 | 10 | 5 | 0.3% | 0.118 |
| 4 | gentle-puffin-33-2546 | +$199.14 | 125 | 7 | 2.1% | 0.090 |
| 5 | zhami-ezha | +$194.36 | 23 | 7 | 3.8% | 0.040 |
| 6 | sunny-stork-38 | +$182.52 | 60 | 7 | 3.0% | 0.065 |
| 7 | esmeralda-tiktok | +$141.00 | 42 | 7 | 1.9% | 0.043 |
| 8 | ryoclouds | +$102.62 | 30 | 6 | 3.2% | 0.027 |
| 9 | iluser | +$76.13 | 14 | 7 | 2.4% | 0.030 |
| 10 | 7na-cris | +$64.55 | 14 | 6 | 2.8% | 0.024 |
| 11 | witty-falcon-43-7877 | +$60.39 | 12 | 5 | 1.4% | 0.034 |
| 12 | rapid-walrus-17-2533 | +$25.08 | 33 | 6 | 3.1% | 0.009 |
| 13 | muhammad-fauzi-2 | +$0.27 | 8 | 3 | 0.0% | 0.058 |

House baselines on the same dev window (graded locally): macd-cci −$20.22
(17 trades), rsi-bollinger −$56.49, adx-momentum −$114.42, ema-cross
−$173.04, momentum −$268.23, buy-and-hold −$869.34, hold-cash $0.00.

### Patterns imitated

- **Frequent small winning trades with tiny drawdown.** Every entry in the
  top 12 is positive on a window where buy-and-hold loses $869, and none
  draws down more than 4.4%. The winners trade 10–125 times and stay mostly
  in cash between trades — they harvest the chop instead of riding the bleed.
- **Dip buying, not trend chasing.** The best house bot is macd-cci, which
  buys oversold dips (MACD above signal + CCI ≤ −48) and takes profit at
  +1%. The leaders' per-trade gains (+$11/trade for #1, +$24/trade for #3)
  are consistent with buying dips and selling bounces at meaningful size.
- **Meaningful stakes.** #3 made +$239 on just 10 trades, so its wins are
  large per trade — small stakes cannot do that. This bot stakes equity / 4
  (the 25% cap) per entry.

### Angle clusters avoided

- **Momentum / trend rotation.** The house momentum baseline loses −$268
  and ema-cross −$173 on the dev window, and my own EMA-crossover and
  24-hour momentum-rotation variants lost $150–270 in backtests. The dev
  window's sharp 24-hour moves reverse the next day (day 1 falls 5–14%,
  day 2 bounces back up to +10%), so buying the top by trailing return buys
  tops and sells bottoms. No momentum leg, no trailing-stop churn, no
  breakout entries.
- **Buy-and-hold / staying invested.** Holding the universe loses $869 on
  the dev window; this bot is in cash unless a dip signal fires.
- **Sitting entirely in cash.** Hold-cash scores $0.00, which ranks ~13th —
  below the top-20% cutoff. The bot must trade, and trade profitably.
- **Over-trading with tight stops.** A 3% trailing stop variant lost money
  even in a rising mirror window: normal hourly chop (±1%) trips tight stops
  and turns noise into realised losses. Exits here are a +2% take-profit, a
  −5% stop, and a 48-bar time exit only.

## The rule (main.ts)

- **Entry:** a symbol's close is at least 1.5% below its own close 6 bars
  ago, and the bot does not already hold it. Stake = equity / 4, capped by
  the 25% weight cap and the cash on hand.
- **Exit (whole position):** value ≥ 102% of cost, or value ≤ 92% of cost,
  or held ≥ 48 bars. A refused fill is re-sent on the next bar while its
  exit reason still holds.
- **Cooldown:** after a stop-loss exit, the symbol may not be re-entered
  for 12 bars.
- **Risk:** max 7 positions (cash limits it to ~4 at 25% each), sells before
  buys in every reply, a sell's proceeds never fund a buy of the same reply,
  slippage capped at 500 bps (the next bar's open sits within 1.3% of the
  previous close on every dev bar, so a fill is essentially never refused
  for slippage — a refused exit once left a losing position open an extra
  bar and changed the whole run after it, so the cap is kept wide on
  purpose). All comparisons are exact BigInt
  arithmetic; no clock, no environment, no randomness — the two grading runs
  produce identical orders.

## Backtest evidence (offline simulator, fills at next open, 15 bps all-in)

Six 72-bar windows (the final window's length) cut from the dev window plus
their mirrors, versus buy-and-hold on the same windows:

| Window | Bot PnL | Trades | Buy-and-hold | Margin over B&H |
| --- | --- | --- | --- | --- |
| real 0–72 | +$472.09 | 22 | −$674.83 | +$1,146.92 |
| real 32–104 | +$156.22 | 17 | −$4.72 | +$160.94 |
| real 64–136 | −$90.63 | 10 | −$299.35 | +$208.72 |
| mirror 0–72 | +$628.77 | 22 | +$663.64 | −$34.87 |
| mirror 32–104 | −$118.21 | 13 | −$48.89 | −$69.32 |
| mirror 64–136 | +$4.60 | 9 | +$251.72 | −$247.11 |

Average +$175.47 per window, worst margin over buy-and-hold −$247.11, max
drawdown 5.3%, minimum 9 trades per window (guardrail: 8; real windows
minimum 10). The bot beats buy-and-hold on 3 of 6 windows and loses to it
only on the mirror (strong-rally) windows, where it still finishes near-flat
instead of chasing the rally — the mirror windows are the inverted dev data,
so a loss there is the price of not buying tops. On the full 136-bar dev
window the offline simulator gives +$354.27 (34 trades); the kit's own
`grade-local` gives **+$202.91 (32 trades, max drawdown 5.78%, 0 rejected,
compliant)** — 4th of 33 entries on the live dev board at build time, above
every house baseline (best: macd-cci −$20.22).

Parameter sensitivity (same six windows): stake equity/4 beats equity/7
(avg +$175 vs +$134); take-profit 2% beats 1.5% and 2.5%; a 6-bar dip beats
3-bar and 12-bar; an EMA trend filter kills the trade count (0–16 trades)
and was rejected; a 2% dip scores higher on the full window but makes only
5 trades on one real 72-bar window, below the 8-trade guardrail, and was
rejected for that reason; requiring the dip to have already turned up on the
latest bar (close above the previous close) halves the trade count and was
rejected. The chosen parameters sit on a broad plateau, not a knife edge.

Revision history: the first version of this rule (dip 1%, stop −5%, no
cooldown, slippage capped at 100 bps) graded **−$127.80 on the dev window**
in `grade-local` — its offline simulator had overstated it by letting a reply
spend cash it did not have, and one slippage-refused exit cascaded into a
different path afterwards. The second version (stop −8%, 12-bar stop
cooldown, slippage capped at 500 bps) graded **−$38.43**. The shipped
version deepens the dip to 1.5% (fewer falling knives: POPCAT went from
−$219.96 to +$61.60 on the dev window) and grades **+$202.91**.
