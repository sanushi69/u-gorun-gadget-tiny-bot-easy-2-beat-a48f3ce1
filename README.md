# Tiny Bot — dip-scalping mean-reversion bot for Solana hourly bars

[![make.fun](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1.svg)](https://make.fun/c/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![Rank](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/sanushi69/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/rank.svg)](https://make.fun/c/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![Reward](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/sanushi69/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/reward.svg)](https://make.fun/c/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)

A tiny paper-trading bot for the [make.fun bounty "Tiny Bot, Easy $2: Beat Buy-and-Hold on Solana"](https://make.fun/c/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1): it reads hourly Solana bars and decides when to hold SOL (and FARTCOIN, JITOSOL, POPCAT, RAY, WETH, WIF), when to sit in USDC, and how much to trade — beating buy-and-hold on the final 3-day replay window.

## The bot

It never chases a trend and never holds the universe. On every hourly bar it buys a symbol that has dipped at least **1.5% over the last 6 bars**, one stake of **equity / 4** (the 25% weight cap) at a time, and sells as soon as the position has bounced **+2% over cost**, fallen **−8% under cost**, or been held **48 bars**. A symbol stopped out is left alone for **12 bars** before it may be bought again. Everything else stays in cash. See [STRATEGY.md](STRATEGY.md) for the evidence: backtests on six 72-bar windows cut from the dev window and their mirrors average **+175 USDC** per window with 9–22 trades, worst window −247 USDC against buy-and-hold, max drawdown 5.3%; graded locally on the full dev window it scores **+$202.91 on 32 trades** — above every house baseline.

## Layout

- `main.ts` — the entrypoint: the grader runs `node /bot/main.ts`. No build step, no network, no dependencies beyond the vendored shim.
- `vendor/makefun-bars.ts` — the kit's `agent-fun/bars-replay/v1` shim, byte-identical to the kit's `sdk/makefun-bars.ts`.
- `STRATEGY.md` — the design, the leaderboard analysis, and the backtest numbers.
- `prompt.txt` — the instruction this entry was built from.

## Run it

```sh
node main.ts   # speaks agent-fun/bars-replay/v1 on stdin/stdout
```

Grade it locally against the dev window with the kit's CLI (from the kit directory):

```sh
node cli/makefun.mjs grade-local --kit . --bot <path-to-this-repo> --driver process
```

## License

MIT — see [LICENSE](LICENSE).
