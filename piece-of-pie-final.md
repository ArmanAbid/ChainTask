# Piece of Pie Final Presentation

for

**ChainTask**

Arman Abid, Solo player

submitting for the :

**Cardano Pie**

## Slide 1: Title

ChainTask — a trustless on-chain job marketplace on Cardano.

## Slide 2: Project Identity

ChainTask is a job marketplace where the money is locked on-chain before any work starts. Clients post jobs and lock ADA in an escrow validator, builders deliver the work and the escrow pays out automatically on approval. Nobody can disappear with the funds - not the client, not the builder, not me.

- official public repository: https://github.com/ArmanAbid/ChainTask
- deployed product: https://chaintask.net (Cardano mainnet)
- primary X account: Arman Abid (@_armanabid)
- team: Arman Abid, solo

## Slide 3: What the Product Does

The problem: hiring someone online runs on trust. Either the client pays upfront and hopes the work shows up, or the builder does the work and hopes to get paid. Freelance platforms "fix" this by holding your money and taking a big cut for it.

Who it's for: people in the Cardano ecosystem who hire or do gig work. Founders posting bounties, builders who want payment guaranteed before they start.

What you can do:

- connect a wallet (Weld) — that's your account
- post a job, the budget locks into escrow in the same tx
- pick a builder from the applicants
- builder submits work, client approves, escrow pays out automatically
- if it goes wrong: disputes go to arbitrators, and AutoRelease / AutoRefund / ArbitratorTimeout make sure funds never get stuck (full 13/13 redeemer coverage)

The value: the money is guaranteed by a validator, not by promises. The builder sees the funds locked before starting. The client knows they can't leave without delivery.

Where payment happens: fully on-chain, in ADA on mainnet. The budget locks into escrow when the job is funded and settles wallet-to-wallet on approval. A small protocol fee goes to the on-chain treasury.

## Slide 4: Live Demo

Demo video: https://drive.google.com/file/d/1z1yra4LbMUhwH7luZOjCzDQtzgkyUrZ-/view?usp=drive_link

Flow:

1. entry point — https://chaintask.net
2. onboarding — connect wallet, set up your on-chain profile
3. core action — post a job → builder applies → client selects → builder submits work
4. payment gate — funding the job locks the budget in escrow, a real on-chain tx
5. result after payment — client approves → escrow pays the builder automatically. Disputes go to arbitrators, auto timeouts cover anyone going silent. Every page reads live chain data, every write is a real mainnet tx.

## Slide 5: How a User Buys the Product

Free to use, no subscriptions. You pay per job, on-chain:

- the client locks the job budget in escrow, plus a small protocol fee to the treasury
- the builder gets paid from escrow on approval - no invoices, no withdrawal delays
- ChainTask never holds anyone's funds, it's all validators. Revenue is the protocol fee on completed jobs.

## Slide 6: Twelve Official Weekly Updates

| Week | X Post |
|------|--------|
| Week 1 | https://x.com/_armanabid/status/2050855511172726883 |
| Week 2 | https://x.com/_armanabid/status/2053232421387305358 |
| Week 3 | https://x.com/_armanabid/status/2055681920164675923 |
| Week 4 | https://x.com/_armanabid/status/2058293373015089559 |
| Week 5 | https://x.com/_armanabid/status/2060861442539303025 |
| Week 6 | https://x.com/_armanabid/status/2063674068407288316 |
| Week 7 | https://x.com/_armanabid/status/2065958967097115063 |
| Week 8 | https://x.com/_armanabid/status/2068459757095325881 |
| Week 9 | https://x.com/_armanabid/status/2071184062350537035 |
| Week 10 | https://x.com/_armanabid/status/2073704611182199077 |
| Week 11 | https://x.com/_armanabid/status/2076264855661629456 |
| Week 12 | https://x.com/_armanabid/status/2078794071594918388 |

## Slide 7: Builder Verification Summary

- [x] live demo completed
- [x] official public repository shown — https://github.com/ArmanAbid/ChainTask
- [x] deployed public product link shown — https://chaintask.net
- [x] live on Cardano mainnet
- [x] all 12 official weekly update posts linked
- [x] public evidence is verifiable

---
