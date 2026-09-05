# Friday Food Club — Market Economics & Business Case

**Status:** Decision brief for pilot design  
**Currency:** Trinidad and Tobago dollars (TTD / TT$)  
**Last updated:** August 31, 2026  
**Purpose:** Give the founder, operators, and an outside advisor such as Claude a complete description of the product, the current money flows, the business risks, and a market-testable monetization plan.

> **Important:** This document does not change production prices, fees, Club Pass benefits, payout rules, or payment-provider behavior. Numbers marked **planning assumption** are deliberately replaceable. Numbers marked **verified** come from the current product code or a cited public source.

## Executive verdict

The current model is mathematically consistent at the transaction level, but it is not yet a convincing business model for the Trinidad and Tobago market.

Today, Friday Food Club mainly earns:

1. **10% of the effective order value** when an order is fulfilled.
2. **TT$5 for a 30-day Club Pass** when a member pays for it.

The platform currently has:

- no buyer service fee;
- no active markup despite a stored `markupRate` setting;
- a 10% discount that reduces both the member's price and the platform's commission base;
- payment-provider costs that are not included in the current platform revenue number;
- cash-order fees recovered through a chef wallet debit, which creates collection and cash-flow risk;
- no delivery revenue, advertising revenue, chef subscription revenue, or other proven secondary stream.

That means the platform can show positive **gross platform revenue** while still losing money after payment processing, support, reconciliation, fraud/refunds, acquisition, and fixed operating costs. The first commercial pilot should test a minimum monetization floor and Club Pass willingness-to-pay before the product commits to a broad discount promise.

## 1. What the product is

Friday Food Club is a curated, limited-inventory food marketplace for Trinidad and Tobago. It is not a general restaurant directory and it is not currently a delivery company.

### Member experience

Members use the mobile app to:

- discover live, time-boxed food drops from verified chefs;
- see the dish, price, remaining inventory, minimum order threshold, countdown, chef, and pickup point;
- follow or favorite chefs and discover recurring dishes;
- reserve a plate using digital payment or cash pickup;
- receive a pickup token and use a QR/manual identifier flow at collection;
- use NFC venue tags or member keychains when a custom native build is available;
- join the optional Club Pass for member pricing, priority access, a badge, and early alerts;
- view orders, payment state, escrow state, pickup readiness, and wallet/profile information;
- access Secret Drops that are restricted to Friday availability.

Digital orders should not be treated as paid merely because a browser checkout opened. The current design waits for a verified payment-provider webhook before moving funds into escrow. Cash orders remain cash-on-pickup reservations.

### Chef experience

Chefs:

- apply for verification or are added by an administrator;
- maintain a profile, cuisine, region, dishes, and reputation;
- create a drop with a price, hard inventory limit, minimum order threshold, pickup location, image, and expiry;
- watch orders and inventory update live;
- fulfill orders by scanning or entering the buyer's pickup token;
- receive digital chef earnings in the wallet after fulfillment;
- collect cash directly for cash orders, while the platform fee is recorded as a wallet debit;
- can become frozen from posting when a cash-fee balance falls below the configured threshold.

The drop is a batch commitment: it unlocks after `currentOrders >= minOrders`, but the current financial calculation is based on all orders and the configured platform fee rather than on a separate batch or delivery charge.

### Admin and operations experience

The creator/admin portal is the operating console. Admins can:

- verify, reject, and manage chefs;
- curate and feature drops;
- manage pickup spots and their NFC identifiers;
- monitor digital escrow and cash reconciliation;
- inspect platform revenue and Club Pass MRR;
- manually credit chef wallets and settle negative balances;
- configure the platform fee, Club Pass price, and wallet freeze threshold;
- handle payment/refund exceptions and operational review.

### Public acquisition surface

The public site is the top-of-funnel surface. It explains the brand, shows current or upcoming drops, attracts members and chefs, and feeds the waitlist. It is not itself the revenue engine; its job is to create qualified demand and supply.

### Technical operating model

Convex is the intended production source of truth for users, chefs, dishes, drops, orders, subscriptions, payment transactions, escrow state, wallets, uploads, locations, and NFC identifiers. The mobile app, portal, and public site consume the same live backend.

WiPay is the intended digital-payment provider. Checkout creation is deliberately behind an adapter boundary because the exact merchant endpoint, fee schedule, request fields, webhook payload, signature header, and status values still need to be confirmed against the merchant account.

## 2. Current money flow

### Current configuration

The current Convex defaults are:

| Setting | Current value | Meaning |
|---|---:|---|
| Platform fee | 10% | Applied to the effective order price at fulfillment |
| Club Pass discount | 10% | Reduces the member's drop price |
| Club Pass price | TT$5 | 30-day pass in the live checkout path |
| Markup | 0% | Stored/configurable, but not currently added to the member price |
| Wallet freeze threshold | -TT$50 | A chef below this balance cannot post new drops |

The admin portal can change the platform fee, Club Pass price, and freeze threshold. The economics below use the current 10% / 10% / TT$5 defaults unless otherwise stated.

### Reconciliation caveats in the current implementation

The configured Club Pass price is not yet used consistently in every reporting path:

- the current hosted checkout preparation reads `config.clubPassPrice`;
- the older `subscriptions.subscribe` mutation still writes a hardcoded TT$5 price;
- the admin statistics query calculates Club Pass MRR as `active subscription count × 5`.

Until those paths are consolidated, changing the pass price in the Control Room can make checkout revenue, subscription records, and reported MRR disagree. This is an implementation issue to resolve after the commercial decision; it is not a reason to guess at a better price now.

The admin “Total Revenue” value is also a ledger view of recorded platform shares, not net cash profit. It excludes provider charges, refunds, chargebacks, support, acquisition, and fixed overhead.

### Order equations

Let:

- `P` = chef's listed drop price;
- `d` = member discount rate, currently `0.10`;
- `f` = platform fee rate, currently `0.10`;
- `M` = 1 for an active Club Pass member and 0 otherwise.

Then:

```text
effectivePrice = round(P × (1 − d × M), 2)
platformShare = round(effectivePrice × f, 2)
chefShare = effectivePrice − platformShare
```

For a digital order:

```text
member pays effectivePrice
provider confirms payment
effectivePrice is held in escrow
pickup verification releases chefShare to the chef wallet
platform records platformShare as revenue
```

For a cash order:

```text
member pays effectivePrice in cash at pickup
chef receives the cash directly
pickup verification records cashCollected = effectivePrice
platformShare is debited from the chef wallet
chef's economic take-home = effectivePrice − platformShare
```

The cash formula is economically equivalent to the digital split, but the collection mechanism is not equivalent. A cash order creates a receivable from the chef to the platform rather than platform cash at the time of sale.

### Club Pass break-even

At a 10% discount, the member must spend approximately:

```text
Club Pass break-even qualifying spend = TT$5 ÷ 10% = TT$50
```

This is before considering the value of priority access, alerts, and the badge. A single TT$45 order saves TT$4.50, which does not quite recover a TT$5 pass. Two TT$45 orders save TT$9.00, leaving the member with TT$4.00 of net savings before assigning any value to the non-price benefits.

That creates a useful product insight: TT$5 is cheap enough to encourage trial, but the platform must have enough repeat order frequency for the pass to be meaningful. It also gives away margin to the most engaged customers.

## 3. Worked examples

### TT$45 drop

| Order type | Member pays | Platform share | Chef economic take-home | Member saving |
|---|---:|---:|---:|---:|
| Non-member | TT$45.00 | TT$4.50 | TT$40.50 | — |
| Club Pass member | TT$40.50 | TT$4.05 | TT$36.45 | TT$4.50 |

The Club Pass member pays TT$4.50 less, but the platform also collects TT$0.45 less commission on that order. The pass payment itself is not allocated to a specific order in the current ledger, so its economics depend on member retention and monthly order frequency.

### Low-ticket TT$15 drop

| Order type | Member pays | Platform share | Chef economic take-home |
|---|---:|---:|---:|
| Non-member | TT$15.00 | TT$1.50 | TT$13.50 |
| Club Pass member | TT$13.50 | TT$1.35 | TT$12.15 |

At this price, TT$1.35–TT$1.50 of platform revenue is unlikely to cover card processing, customer support, reconciliation, and acquisition. A minimum platform take or a buyer fee becomes more important as the catalog includes lower-priced items.

### Premium TT$75 drop

| Order type | Member pays | Platform share | Chef economic take-home |
|---|---:|---:|---:|
| Non-member | TT$75.00 | TT$7.50 | TT$67.50 |
| Club Pass member | TT$67.50 | TT$6.75 | TT$60.75 |

Higher-ticket drops carry more platform revenue, but they may be less frequent and more price-sensitive. A marketplace cannot assume that a premium item will subsidize a large volume of low-ticket orders.

## 4. Market baseline

### Verified local evidence

The following evidence is directly cited and should be treated as context, not as proof that FFC will achieve any particular conversion rate.

| Fact | What it means for FFC | Source |
|---|---|---|
| Trinidad and Tobago had approximately 1.51 million people in January 2025. | The home market is intentionally small; the first plan should win dense local communities rather than assume unlimited national scale. | DataReportal, *Digital 2025: Trinidad and Tobago* — https://datareportal.com/reports/digital-2025-trinidad-and-tobago |
| Approximately 1.28 million people used the internet in January 2025, representing 84.7% penetration. | A mobile-first product is plausible, but internet reach is not the same as food-market demand or payment conversion. | DataReportal — https://datareportal.com/reports/digital-2025-trinidad-and-tobago |
| DataReportal reported 873 thousand social-media user identities in January 2025, or 57.8% of the population. | Social sharing and creator-led demand are credible acquisition channels, but identities are not necessarily unique people. | DataReportal — https://datareportal.com/reports/digital-2025-trinidad-and-tobago |
| IRD says VAT applies to goods and services at 12.5% and identifies TT$600,000 in commercial supplies over a 12-month period as the registration threshold stated on its VAT page. | A platform that approaches the threshold needs accounting advice on whether and how its commissions, fees, subscriptions, or pass-through food sales are treated. | Inland Revenue Division, *Value Added Tax (VAT)* — https://www.ird.gov.tt/VAT |
| WiPay's public home page advertises card acceptance, payment links, QR codes, local bank settlement, and “transparent pricing,” but does not publish the merchant rate needed for this model. | The payment cost is an open input. Do not call platform fee revenue contribution margin until the merchant quote and settlement terms are known. | WiPay Caribbean — https://wipaycaribbean.com |

### What is not yet verified

Do not use the following as facts until measured or sourced locally:

- a national average prepared-meal price;
- the share of customers willing to pay online for a pickup reservation;
- the share of customers who prefer cash;
- the share of chefs willing to pay a commission;
- WiPay's exact percentage, fixed fee, settlement timing, chargeback cost, refund cost, or VAT treatment;
- customer acquisition cost from Instagram, WhatsApp, TikTok, creators, or paid media;
- support minutes per order;
- food-safety, licensing, or tax obligations for each chef and for the marketplace.

### Product price range versus market proof

The current seed data contains drops from TT$15 to TT$75:

- TT$15 doubles;
- TT$28 pelau;
- TT$45 oxtail;
- TT$55 crab back roti;
- TT$75 lobster pasta.

This is useful product test data, not an external market survey. It suggests three test bands:

| Pilot band | Test prices | Question |
|---|---:|---|
| Value | TT$15–25 | Does a low price generate enough volume to cover a minimum platform take? |
| Core | TT$28–55 | Is this the repeat-use heart of the marketplace? |
| Premium | TT$60–85 | Does scarcity and chef reputation support a higher take per order? |

The pilot should capture displayed price, checkout starts, completed payments, cancellations, repeat purchases, and chef willingness to relist for every band.

## 5. Illustrative unit economics

The table below is a planning model, not a forecast. It uses the current 10% platform share, 10% member discount, and TT$5 pass, then adds explicit placeholder costs so that “revenue” is not confused with “money available to operate.”

### Planning assumptions

| Input | Lean pilot | Base pilot | Scaled local |
|---|---:|---:|---:|
| Average listed price | TT$35 | TT$45 | TT$55 |
| Orders per month | 300 | 1,000 | 3,000 |
| Share of orders from Pass members | 25% | 50% | 65% |
| Club Pass adoption among active members | 15% | 25% | 40% |
| Orders per member per month | 1.0 | 1.5 | 2.5 |
| Digital payment share | 35% | 60% | 80% |
| Variable support/ops cost per order | TT$1.50 | TT$1.50 | TT$2.00 |
| Illustrative card cost | 3% + TT$0.50 | 3% + TT$0.50 | 3% + TT$0.50 |
| Illustrative fixed monthly overhead | TT$8,000 | TT$20,000 | TT$40,000 |

The card-cost line is intentionally an assumption until WiPay supplies a merchant quote. It is included to demonstrate sensitivity, not to claim WiPay charges that amount.

### Current model scenarios

| Metric | Lean pilot | Base pilot | Scaled local |
|---|---:|---:|---:|
| Average effective order price | TT$34.13 | TT$42.75 | TT$51.43 |
| Active members implied by order frequency | 300 | 667 | 1,200 |
| Active Passes implied by adoption | 45 | 167 | 480 |
| Platform order revenue | TT$1,023.75 | TT$4,275.00 | TT$15,427.50 |
| Club Pass revenue | TT$225.00 | TT$833.33 | TT$2,400.00 |
| **Gross platform revenue** | **TT$1,248.75** | **TT$5,108.33** | **TT$17,827.50** |
| Illustrative payment costs | (TT$189.24) | (TT$1,177.83) | (TT$5,214.60) |
| Variable support/ops | (TT$450.00) | (TT$1,500.00) | (TT$6,000.00) |
| **Contribution before fixed overhead** | **TT$609.51** | **TT$2,430.50** | **TT$6,612.90** |
| Illustrative fixed overhead | (TT$8,000.00) | (TT$20,000.00) | (TT$40,000.00) |
| **Illustrative monthly result** | **(TT$7,390.49)** | **(TT$17,569.50)** | **(TT$33,387.10)** |
| Chef economic take-home before chef costs | TT$9,213.75 | TT$38,475.00 | TT$138,847.50 |
| Member savings from the 10% discount | TT$262.50 | TT$2,250.00 | TT$10,725.00 |

The model is intentionally sobering: even 3,000 orders per month is not enough under the stated fixed-cost assumption. This does not prove FFC cannot work. It proves that a 10% take on its own is not a safe assumption for a staffed, card-enabled operation.

### Break-even sensitivity

Under the base assumptions, the current model contributes approximately TT$2.43 per order before fixed overhead. At TT$20,000 of fixed monthly overhead:

```text
break-even orders ≈ TT$20,000 ÷ TT$2.43
break-even orders ≈ 8,229 orders per month
```

If a transparent TT$3 buyer fee were added to every completed order and retained by the platform, the illustrative base contribution rises to about TT$5.43 per order and break-even falls to approximately 3,683 orders per month. That is a materially better equation, but the fee may reduce conversion and should be tested rather than assumed.

These calculations do not include the chef's ingredient cost, packaging, labor, venue cost, or tax. Those costs belong in the chef's own price decision and in supply-side interviews. They do matter to whether chefs can accept the platform take and continue listing.

## 6. Monetization options

| Option | Who pays | What it improves | Main risk | Pilot position |
|---|---|---|---|---|
| Current 10% commission | Chef economically pays | Simple story and low supply friction | Too little per low-ticket order; discounts reduce the take; cash recovery is fragile | Keep as control group, not the only launch plan |
| Small buyer service fee | Member pays | Adds predictable revenue on digital and/or all completed orders | Checkout sticker shock and possible drop-off | Test TT$2 and TT$3 with clear labeling |
| Minimum platform take | Chef or member, depending presentation | Protects low-ticket orders such as TT$15 items | Can feel punitive to small chefs | Test a floor such as TT$3 on completed orders; do not combine with a large buyer fee initially |
| Tiered commission | Chef pays a rate based on volume or service | Lets high-volume chefs earn a better rate while protecting platform economics | More difficult to explain and administer | Consider after real order-volume data exists |
| Chef subscription | Chef pays monthly for lower commission, analytics, or featured tools | Creates recurring revenue and aligns with professional sellers | Too early if chefs have not seen demand | Interview first; test only with chefs already repeating drops |
| Club Pass at a higher price | Member pays | Better recurring revenue and less risk that one order consumes the pass price | Higher price may reduce adoption; benefit must feel exclusive | Test TT$10 and TT$15 against TT$5; keep 10% discount only if frequency supports it |
| Sponsored discovery | Chef, venue, or brand pays | Monetizes attention without taxing every order | Can undermine trust and curation | Defer until the marketplace has measurable traffic |
| Venue/brand partnerships | Venue or brand pays or subsidizes | Can fund pickup infrastructure, NFC tags, and local events | Longer sales cycle and operational complexity | Explore as a second-stage channel, not a launch dependency |
| Delivery fee | Member pays, if delivery is added | Captures logistics cost directly | Delivery adds dispatch, support, refunds, and margin complexity | Out of current pickup-first pilot |

## 7. Recommended launch model to test

This is a recommendation for experimentation, not a production configuration change.

### Recommendation A — use a fee floor before increasing the headline rate

Test either:

- the current 10% commission plus a small minimum platform take on completed orders; or
- a small, transparent buyer service fee with the current 10% commission.

Do not launch both a large buyer fee and a higher chef commission at the same time. The pilot needs to show which side of the marketplace is most sensitive to price.

The minimum take is especially important for low-ticket drops. A flat floor can be less visible to members than a new checkout surcharge, but it must be disclosed to chefs and built into their price calculator.

### Recommendation B — treat Club Pass as a retention product, not the core profit engine

Keep the priority-access and early-alert benefits because they fit the scarcity model. Test TT$10 and TT$15 price points against TT$5, and display the member's actual savings clearly.

The Pass should not promise “zero service fees” until a service fee exists. That promise creates a future pricing constraint and currently describes a benefit the order model does not charge for.

The key pass metrics are:

- activation rate;
- payment-confirmed rate;
- first-order conversion;
- qualifying spend per pass holder;
- orders per pass holder;
- 30-day renewal or repeat purchase;
- incremental margin after discount and payment cost.

### Recommendation C — make cash a controlled exception

Cash is useful for local adoption, but it should not become an unlimited unsecured balance-sheet product. The operating pilot should use:

- a defined chef settlement cadence;
- clear wallet statements;
- a limit on outstanding cash fees;
- a preferred digital-payment incentive if the data supports it;
- a manual reconciliation process until failure rates are known.

The goal is to measure whether cash increases completed demand enough to compensate for collection risk and admin time.

### Recommendation D — build density before broad geographic expansion

The market is small enough that a scattered national launch could create an empty marketplace. Start with a few dense pickup communities and measure:

- active chefs per pickup area;
- live drops per day;
- orders per drop;
- time to reach minimum orders;
- repeat member rate;
- cross-chef purchase rate;
- fulfillment failure and refund rate.

The product's strongest moat is likely not the checkout itself. It is reliable local supply, chef trust, scarcity, pickup convenience, and a recognizable community brand.

## 8. Pilot scorecard

The pilot should not be judged by downloads or waitlist size alone.

### Demand

- 30-day active members;
- percentage who view a drop and reserve;
- checkout-start-to-paid conversion;
- cash versus digital selection;
- repeat order rate at 30 and 60 days;
- Club Pass activation and renewal;
- member savings and contribution margin by order band.

### Supply

- verified chefs who publish at least two drops;
- orders per drop;
- sell-through rate;
- time to minimum order threshold;
- chef relist rate;
- chef-reported contribution after ingredients, packaging, labor, and platform charges;
- cash-fee settlement completion.

### Platform economics

- gross order value;
- platform commission;
- buyer fees, if tested;
- Club Pass revenue;
- payment costs by method;
- refunds and chargebacks;
- support minutes per order;
- contribution margin per completed order;
- customer acquisition cost;
- monthly fixed burn;
- break-even orders at actual observed contribution.

### Decision gates

At the end of the first pilot, decide:

1. Is the core price band closer to TT$15–25, TT$28–55, or premium pricing?
2. Does a buyer fee reduce conversion more than it improves contribution?
3. Does the minimum platform take create chef churn?
4. Does Club Pass increase repeat behavior enough to justify its discount?
5. Is cash operationally manageable?
6. Can the marketplace reach contribution-positive density in one or two communities before expanding?

## 9. Open questions before final pricing

### WiPay and payments

- What exact percentage and fixed fee does WiPay charge in the intended merchant account?
- Are fees charged on the order amount, the buyer fee, the Club Pass, or all of them?
- Who bears chargebacks, failed-payment fees, and refunds after settlement?
- What are settlement days and payout holds?
- What webhook statuses and signature rules are authoritative?
- Can the provider support recurring Club Pass billing, or is each 30-day pass a new checkout?

### Tax and compliance

- Is FFC acting as marketplace agent, merchant of record, or a service provider?
- Does VAT apply to gross customer collections, platform fees, Club Pass, or another taxable base?
- Which chefs must be VAT-registered?
- What invoices or receipts must be produced?
- What food-safety, licensing, consumer-protection, privacy, and payment obligations apply?

### Operations

- Who owns pickup-site costs and NFC tag replacement?
- How are no-shows and spoiled food handled?
- Who pays for member support?
- How often are cash wallet fees reconciled?
- What is the real cost of a refund or a failed fulfillment?

### Market

- What do five comparable Trinidad prepared-meal options charge today for a similar portion?
- What price would a member call “a good deal” versus “too cheap to trust”?
- What commission would an independent chef accept after ingredient and packaging costs?
- Which communities have enough density for a weekly drop rhythm?
- Does the Club Pass create real repeat behavior or only one-time curiosity?

## 10. Claude-ready product and business brief

The following can be copied into Claude or another outside advisor without access to the repository:

> You are advising Friday Food Club, a Trinidad and Tobago food-drop marketplace. Be skeptical, local-market-aware, and explicit about uncertainty.
>
> **Product:** Members use a mobile app to discover limited-time, limited-inventory food drops from verified independent chefs. Each drop has a listed price, inventory cap, minimum order threshold, pickup location, countdown, and chef profile. Members can reserve digitally or choose cash pickup. Digital payments open a hosted WiPay checkout and remain pending until a verified webhook confirms payment. Once the member collects and the chef verifies the pickup QR/token, digital escrow releases the chef's share. Cash is collected by the chef at pickup and the platform fee is debited from the chef wallet. NFC venue tags and member keychains are planned for custom native builds; QR and manual identifier entry are fallbacks. Secret Drops are Friday-only scarcity products.
>
> **Chefs:** Chefs apply for verification or are added by admins. They create drops, set price/inventory/minimum orders, manage live orders, fulfill pickups, and receive digital payouts in a wallet. The platform can freeze posting when a chef's cash-fee balance is too negative.
>
> **Admins:** Admins verify chefs, curate drops, manage locations and NFC identifiers, monitor digital escrow and cash reconciliation, credit wallets, handle payment exceptions, and configure fee/pass settings. A public website attracts members and chefs.
>
> **Current production economics:** The default platform fee is 10% of the effective order price at fulfillment. Club Pass costs TT$5 for 30 days and gives a 10% discount plus priority access, a badge, and early notifications. There is currently no buyer service fee and markup is zero. For a listed TT$45 drop, a non-member pays TT$45, the platform records TT$4.50, and the chef's economic share is TT$40.50. A Pass member pays TT$40.50, the platform records TT$4.05, and the chef's economic share is TT$36.45. A member saves TT$4.50 on that order. The TT$5 Pass therefore needs about TT$50 of qualifying spend to recover its price from the discount alone.
>
> **Known risks:** The platform's gross take is small on low-ticket orders; the 10% discount also reduces the commission base; payment-provider fees are not included in the current platform revenue number; cash creates a chef receivable and reconciliation burden; fixed costs, support, acquisition, refunds, chargebacks, tax, and compliance are not in the current equation.
>
> **Verified context:** DataReportal reported approximately 1.51 million people, 1.28 million internet users (84.7% penetration), and 873 thousand social-media user identities (57.8%) in Trinidad and Tobago in January 2025. The Inland Revenue Division says VAT is 12.5% and its VAT page states a TT$600,000 commercial-supply registration threshold over 12 months. WiPay publicly promotes card acceptance, payment links, QR codes, local settlement, and transparent pricing, but the merchant fee and settlement contract are not yet confirmed.
>
> **Your job:** Evaluate whether this marketplace can make money in Trinidad and Tobago. Build conservative, base, and optimistic scenarios using realistic local meal prices, order frequency, digital/cash mix, payment costs, support, refunds, acquisition, and fixed overhead. Do not invent local statistics: label assumptions and show which ones need interviews, quotes, or a pilot. Compare the current 10%/TT$5 model with a minimum platform take, a TT$2–3 buyer fee, tiered commission, chef subscriptions, a higher Club Pass price, sponsored discovery, and venue/brand partnerships. For each option, show who pays, the member price, the chef take-home, the platform contribution after variable costs, and the risk to marketplace liquidity.
>
> End with a recommended pilot model, exact metrics and decision gates, the minimum order density needed for contribution-positive operations, the WiPay questions that must be answered, and a sequence of changes that should not be implemented until the evidence supports them.

## Sources

1. Inland Revenue Division, **Value Added Tax (VAT)**: https://www.ird.gov.tt/VAT
2. DataReportal, **Digital 2025: Trinidad and Tobago**: https://datareportal.com/reports/digital-2025-trinidad-and-tobago
3. WiPay Caribbean public site: https://wipaycaribbean.com
4. Current product implementation: `artifacts/convex-backend/convex/config.ts`, `orders.ts`, `fulfillment.ts`, `payments.ts`, `subscriptions.ts`, `schema.ts`, plus the mobile and admin surfaces listed in the project task.
