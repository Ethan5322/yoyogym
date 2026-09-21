---
aliases: ["Supabase Enquiry"]
tags: [action, blocked, supabase]
stage: "Action required"
status: "ready to send"
updated: 2026-09-21
---

# Supabase enquiry — ready to send

**Why this matters.** Two open items rest on the answers, and one of them can reopen the whole
architecture:

- **U-1** — if there is a cap on projects per organisation below the target, **D-016 (shared app,
  database per gym) and D-014 (a database per gym) both have to be revisited.** This was approved as
  an accepted risk, not a resolved one.
- **U-4 / U-2** — at ~$10 per project per month, a thousand gyms is roughly **$10,000/month** and ten
  thousand is about **$100,000/month**. Volume terms, if they exist, are the only lever on that
  number that is not already yours.

Send to Supabase support or sales (sales is the better route for the second question).

---

## Draft

> **Subject:** Project limits and volume pricing for a multi-tenant platform (one project per customer)
>
> Hello,
>
> We are building a B2B platform where **each customer gets their own Supabase project**, for data
> isolation reasons — our customers are gyms, and each holds its own members' health and biometric
> data, so we want that data physically separated rather than pooled behind RLS. Our customers
> remain the responsible party for their members' data under South Africa's POPIA; we are the
> operator.
>
> We are planning for growth into the low thousands of projects over the next 24 months, and would
> like to confirm two things before we commit to this architecture:
>
> **1. Is there a maximum number of projects per organisation on a paid plan?**
> The pricing and billing documentation covers cost per project, but we could not find a stated
> upper limit. If a cap exists — whether hard or soft, and whether it can be raised — we need to
> know before building on this model.
>
> **2. Do you offer volume or partner pricing at that number of projects?**
> At the standard ~$10/month per project for Micro compute, a thousand projects is roughly
> $10,000/month. If there is a volume tier, a partner programme, or a different structure you would
> recommend for this pattern, we would like to understand it.
>
> Two smaller related questions, if convenient:
>
> - Are there **rate limits on the Management API** for programmatic project creation? We intend to
>   provision projects automatically on customer approval.
> - Is there anything about this **one-project-per-customer pattern** you would advise against at
>   this scale, or a different approach you have seen work better?
>
> Happy to give more detail on the architecture if it helps.
>
> Thank you,
> MuleSoo Digital Solutions

---

## What to do with the answers

| Answer | Consequence |
|---|---|
| **No project cap, or a raisable one** | D-016 and D-014 stand. Remove U-1 from the risk register |
| **A cap below the target** | ⚠️ **Reopen D-016 and D-014.** Either shard across multiple organisations (a Model C variant), or revisit pooling — which collides with the POPIA position in D-014 |
| **Volume pricing exists** | Feeds straight into tier pricing (D-058), which is deliberately unset pending this |
| **No volume pricing** | The ~$10/gym/month floor is real and permanent. Basic must price above it |
| **Management API is rate-limited** | Feeds provisioning design (D-078) — batching, queueing, retry |

Record whatever comes back in [[18 - Decision Log]] and strike the resolved items from
[[17 - Open Questions]].
