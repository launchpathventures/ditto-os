# Brief 119 — Pricing Strategy

**Status:** Active
**Date:** 2025-04-09

## Context

Token efficiency analysis (Insight-170) established the cost floor per user activity. Average user daily compute cost is ~$0.55-0.72/day after optimizations (~$17-22/month). This brief defines the pricing model that captures value above the cost floor while aligning incentives with Ditto's core value proposition: reputation-first, trust-earned.

## The Three Value Moments

### Moment 1: "I see what you can do" (Front Door)
- **Cost:** ~$0.03/conversation
- **Value to user:** Zero until action happens
- **Value to Ditto:** Lead qualification + relationship data
- **Pricing:** Free. Always.

### Moment 2: "You did something for me" (First Deliverable)
- **Cost:** $0.05-0.50 per deliverable
- **Value to user:** Measurable outcome (introduction made, briefing delivered)
- **Pricing:** Success fees on outcomes, not inputs

### Moment 3: "You run part of my business" (Ongoing)
- **Cost:** $0.55-3/day ($17-90/month)
- **Value to user:** Compounding (Ditto gets smarter, processes improve)
- **Pricing:** Subscription tiers

## Pricing Architecture

### Free: Meet Alex
- Unlimited front door conversations
- Alex researches targets, shows framing
- First 3 outreach sends free (connector or sales mode)
- First CoS briefing free

### Success Fees: Network (Connector + Sales)

| Outcome | Connector | Sales | Detection |
|---------|-----------|-------|-----------|
| Introduction sent | Free | Free | Automatic |
| Response received | $2-5 | $5-10 | Email tracking |
| Meeting booked | $15-25 | $25-50 | Self-report + confirmation |

### Subscription: Workspace

| Tier | Price | Included |
|------|-------|----------|
| **Starter** | $29/month | Weekly briefings, 5 process runs/month, basic workspace |
| **Professional** | $79/month | Daily briefings, unlimited runs, full workspace, knowledge base |
| **Business** | $199/month | Everything + team contexts, priority execution, custom integrations |

## Trust Ladder (When to Charge)

```
FREE        -> Alex conversation + 3 free sends
SUCCESS FEE -> Responses & meetings from outreach
STARTER     -> After ~2 weeks / 5+ outcomes
PROFESSIONAL -> After ~1 month / processes running
BUSINESS    -> After ~3 months / Ditto is infrastructure
```

## Incentive Alignment

Charging on outcomes (not sends) means:
- Ditto is financially incentivised to protect Alex's reputation
- Users don't ration sends (no transactional feeling)
- Spam is structurally unprofitable
- Quality compounds: better introductions -> more responses -> more revenue

## Unit Economics

| Tier | Revenue | Compute Cost | Margin |
|------|---------|--------------|--------|
| Free | $0 | ~$1/month | N/A (lead gen) |
| Success fee only | ~$50/month | ~$5/month | ~90% |
| Starter | $29 + ~$20 fees | ~$17/month | ~50% |
| Professional | $79 + ~$40 fees | ~$45/month | ~55% |
| Business | $199 + ~$60 fees | ~$90/month | ~55% |

## Revenue Model (1000 users, 12 months)

| Segment | Users | Rev/User/Month | Monthly |
|---------|-------|----------------|---------|
| Free | 500 | $0 | $0 |
| Success fee only | 200 | $50 | $10,000 |
| Starter | 150 | $49 | $7,350 |
| Professional | 100 | $119 | $11,900 |
| Business | 50 | $259 | $12,950 |
| **Total** | **1000** | | **$42,200/month** |

Compute: ~$15,000/month. **Gross margin: ~64%.**
