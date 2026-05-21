# SPEC.md — Matcha Pop-Up Operations & Finance App (Finalized)

> Status: **Implementation-ready.** Decisions below supersede the original interview-driven scaffold. Anything not explicitly listed here is out of scope for v1.

---

## 1. Product Summary

A web app for running a small matcha pop-up business. Two devices share one workspace in real time: the **order taker** drives a phone, the **barista** drives a tablet. The app handles live ordering, a barista preparation queue, per-event menu snapshots, ingredient-derived cost calculations, an event summary dashboard with charts, and a single-CSV-per-event export.

Internal operations tool. Optimized for speed at a booth, not for marketing polish.

---

## 2. Final MVP Scope

### In scope
- Workspace pairing via permanent 6-char code (no auth)
- Real-time two-device sync (order taker + barista)
- Plan-ahead events, one active at a time, frozen menu snapshot per event
- Live order entry: cart-based flow, item cards with milk chip + Customize expander
- Barista queue with per-drink completion, oldest-pending-first sort
- Menu Manager: items + global Ingredients table (milks/creams as pools)
- Finance: ingredient-derived per-item cost; event-level fixed costs
- Event Summary dashboard with 3 charts
- CSV export (item-level, one file per event)
- Pre-seeded sample event + sample menu/ingredients; resettable from Settings
- Subtle ping + flash on new orders for the barista
- Low-margin warning icon on items below a configurable threshold

### Out of scope (v1)
- Tax, tips, payment processor fees, refunds
- Authentication, named user accounts
- Offline mode
- Dark mode
- Per-modifier upcharges (modifiers never change customer price)
- Customer-facing ordering, QR ordering, online payments
- Inventory tracking beyond per-event ingredient costing
- Receipt printing, loyalty, forecasting
- Search/filter/bulk actions in Menu Manager
- Multi-event simultaneous-Active

---

## 3. Tech Stack (decided)

- **Framework:** Next.js 15 (App Router) + TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **Charts:** Recharts
- **Database + Realtime:** Supabase (Postgres + Realtime channels)
- **Hosting:** Vercel
- **Forms:** react-hook-form + zod
- **State:** React Query for server cache + Supabase channel subscriptions for live updates
- **CSV:** in-app generator (no library needed beyond a small helper)

No offline support. Online is required. Last-write-wins for concurrent edits (no CRDT, no field-level merging, no locks).

---

## 4. Roles & Devices

There is no role-based gating in the UI. Any device that joins a workspace sees every tab.

- **Order taker** — typically on a phone. Drives Live Orders.
- **Barista** — typically on a tablet. Drives Barista Queue. Tablet may be propped at the prep station.
- **Operator** — same person, between events. Uses Menu Manager / Finance / Event Summary.

Pairing: the first device creates a workspace and receives a permanent 6-character code (e.g. `MATCHA-7K2A`). Subsequent devices join by entering the code on the welcome screen. Workspace code is viewable from Settings; not rotatable in v1.

---

## 5. Navigation

Adaptive shell:
- **Mobile (< 768px):** bottom tab bar with 5 tabs
- **Tablet / desktop (≥ 768px):** left sidebar with the same 5 tabs + a compact "Active event" indicator at the top of the sidebar

Tabs (in order):
1. Live Orders
2. Barista Queue
3. Menu Manager
4. Finance
5. Event Summary

Plus a Settings page (workspace code view, low-margin threshold, sample-data reset, milk/cream pool admin) accessible from a small gear icon.

The currently active event is always visible somewhere in the chrome — sidebar header on tablet+, a compact pill above the tab bar on mobile. Tapping it opens the event picker.

---

## 6. Event Lifecycle

- Operator can plan multiple future events ahead of time.
- Exactly one event is **Active** at any time. The order taker always submits into the Active event.
- Switching the Active event is a deliberate two-tap action (picker → confirm).
- Events do **not** have a formal Open/Closed status in v1. They stay editable indefinitely.
- An event freezes its menu snapshot at creation time (see §8). Editing the master menu afterward never mutates a frozen event.
- Order numbers reset to **#1** at the start of each event.

### Event fields
- `id`
- `name` (required)
- `date` (required)
- `startTime`, `endTime` (required — used for the time-of-day chart)
- `targetRevenue` (optional — drives a progress bar in Event Summary)
- `menuSnapshotId` (required — set at creation)
- `createdAt`, `updatedAt`

No location, no weather, no free-text notes in v1.

---

## 7. Live Orders Tab

### Layout
- Grid of menu item cards (responsive: 2-col mobile, 3-col tablet, 4-col desktop)
- Persistent cart panel: bottom sheet on mobile, right rail on tablet/desktop
- Bottom-of-cart: large running total ($ amount), Submit button (disabled until name + payment status set)

### Item card
- Item name
- Selling price (right-aligned, prominent)
- Category chip (subtle)
- Default size
- Short description (optional, 1 line)
- Quick-add tap: tapping the card adds **one** line to the cart with the item's default modifiers
- Long-press / "Customize" icon: opens modifier sheet before adding

### Modifier sheet (per cart line)
- **Milk** (primary, always visible as chips): whole / oat / lactose-free / (admin can add more in Settings → Milk Pool). Default = item's declared default milk.
- **Customize** expander (collapsed by default; opens on tap):
  - **Sugar:** less sweet / normal / extra sweet / no agave
  - **Ice:** light / normal / extra
  - **Cream choice** (only shown if item supports creams): ube / sesame / banana / strawberry / plain / no cream / extra cream / mixed creams
  - **Special requests** (free text, 1 line)

Two of the same item with different modifiers → **two separate cart lines**. Quantity stepper +/- on each line only applies when all attributes match.

### Order-level fields
- `customerName` (required — short freeform text)
- Auto-assigned `orderNumber` (per-event, starts at #1)
- `paymentStatus`: **paid** / **unpaid** / **comped** (required)
- `paymentMethod` (required when paid): cash / venmo / zelle / card / other
- `compReason` (required when comped — quick chips: Friend / Sample / Mistake / Other)
- `notes` (optional, order-level free text)

### Modifiers never affect price
Posted price is final. Modifiers may affect **cost** (see §9) but never revenue.

### Submit
On Submit, the order:
1. Is persisted as `Order` + `OrderItem[]` with `status: "pending"`
2. Appears in the Barista Queue (live, via Supabase Realtime)
3. Increments quantity-sold counters in Event Summary
4. Contributes to revenue per the rules in §10

---

## 8. Menu Manager Tab

Single scrollable list of menu items. No search, no filter, no bulk action.

### Item fields
- `id`
- `name` (required)
- `category`: matcha / hojicha / cream_top / pastry / seasonal / other
- `price` (selling price, required)
- `size`: 8oz / 10oz / 12oz / 16oz / pastry_count / other
- `active` (toggle; archived items are hidden from Live Orders but stay queryable in history)
- `description` (optional, 1 line)
- **Ingredient lines:** ordered list of `{ ingredientId, amount, unit }`
- **Default milk:** references one entry in the Milk pool. Optional (omitted = item doesn't use milk, e.g. pastries)
- **Default cream:** references one entry in the Cream pool. Optional (omitted = item doesn't use cream)
- **Allowed milks / Allowed creams:** subset of the pool that can be picked at order time (defaults: full pool)
- `derivedCost` (read-only — computed from ingredients + default milk/cream; see §9)
- `createdAt`, `updatedAt`

### Actions
- Add / edit / archive (toggle active)
- **Delete is blocked** if the item appears in any submitted order anywhere. UI shows "Archive instead." Items never used can be hard-deleted.

### Master menu vs. event snapshot
- The Menu Manager edits the **master menu**.
- When an event is created, the system copies the entire master menu (items + their ingredient lines + the relevant Ingredient rows + Milk/Cream pool entries used) into an immutable **menu snapshot** attached to that event.
- Editing the master menu after the event was created does **not** affect that event.
- Mid-event price/cost changes: edit the event's snapshot directly via "Edit event menu" in Event Summary. This only affects future orders in that event; already-submitted order items keep their own price/cost stamps (see §11).

---

## 9. Ingredients & Cost Model

### Ingredients table
Global, shared across all events (the snapshot copies them in, so historical events stay frozen).

```ts
type Ingredient = {
  id: string;
  name: string;
  packagePrice: number;        // e.g. 159
  packageAmount: number;       // e.g. 500
  unit: Unit;                  // e.g. "g"
  pool?: "milk" | "cream" | null; // if set, this ingredient belongs to a swappable pool
};
```

### Units
Three categories with conversion **within** category. No cross-category conversion.

- **Mass:** `g`, `oz`, `kg`, `lb` (canonical: `g`)
- **Volume:** `ml`, `fl_oz`, `cup` (canonical: `ml`)
- **Count:** `piece`, `bag` (no conversion)

Conversion table (canonical):
- 1 oz = 28.3495 g
- 1 kg = 1000 g
- 1 lb = 453.592 g
- 1 fl_oz = 29.5735 ml
- 1 cup = 236.588 ml

A menu item's ingredient line can declare amount in any unit within the ingredient's category; the app converts as needed.

### Milk & Cream pools
- **Milk pool:** a set of Ingredients marked `pool: "milk"`. Each menu item declares one default milk + an allowed-milk subset + an `amountUsed` (e.g. 180 g).
- **Cream pool:** same pattern, `pool: "cream"`.
- At order time, the customer's chosen milk replaces the default. The cost calc uses the chosen milk's `$/unit` × the menu item's declared `amountUsed`.

### Per-item cost (derived)
For a given menu item with chosen modifiers:

```
costPerItem = sum over ingredient lines:
  if ingredient.pool == "milk":  costOf(orderItem.milkChoice ?? item.defaultMilk, line.amount, line.unit)
  elif ingredient.pool == "cream" and item uses cream and orderItem has cream:
                                  costOf(orderItem.creamChoice ?? item.defaultCream, line.amount, line.unit)
  else:                           costOf(line.ingredient, line.amount, line.unit)
```

Where `costOf(ingredient, amount, unit) = (ingredient.packagePrice / toCanonical(ingredient.packageAmount, ingredient.unit)) * toCanonical(amount, unit)`.

Cups, lids, straws, ice, agave, etc. are modeled as ordinary ingredient lines on each menu item (per-drink variable cost).

### Fixed costs (event-level only)
- Event-level fixed costs (table fee, permit, transport, etc.) do **not** affect per-drink cost or per-item margin.
- They are subtracted from total event profit only.
- The data model still includes an `allocationMethod` field for future flexibility, but the v1 UI exposes only `event_only`.

### Selling price
Static per menu item. Modifiers never change it.

---

## 10. Money Rules

### Revenue recognition
- **Gross revenue** = sum of selling prices for orders with `paymentStatus = paid` and `status ≠ cancelled`.
- **Owed** (separate counter, shown alongside revenue) = sum for `paymentStatus = unpaid` and `status ≠ cancelled`.
- **Comped** = $0 revenue. Counts toward quantity sold. Tracked with a reason chip.
- **Cancelled** = excluded from both revenue and quantity sold. Stays visible in order history for audit.

### Per-item totals (Event Summary)
- `revenuePaid_i = price_i × paidCount_i`
- `revenueOwed_i = price_i × unpaidCount_i`
- `quantitySold_i = paidCount_i + unpaidCount_i + compedCount_i` (excludes cancelled)
- `totalCost_i = costPerItem_i × quantitySold_i` (comped drinks were still made, so they cost money)
- `profit_i = revenuePaid_i - totalCost_i` (conservative: unpaid not yet collected)
- `margin_i = profit_i / revenuePaid_i` (if `revenuePaid_i > 0`, else null)

### Event totals
- `eventRevenuePaid = sum(revenuePaid_i)`
- `eventTotalCost = sum(totalCost_i) + sum(fixedCosts)`
- `eventProfit = eventRevenuePaid - eventTotalCost`
- `eventMargin = eventProfit / eventRevenuePaid` (if > 0)

### Edge cases (resolved)
- **Selling price = 0:** Allowed (e.g. a freebie item). Margin shows as "n/a" rather than dividing by zero.
- **Unpaid items:** counted as quantity sold + cost; **not** counted in revenue until marked paid.
- **Cancelled orders:** zero contribution everywhere; visible in history with a "Cancelled" badge.
- **Refunds:** Not supported in v1. Workaround: edit the order → set `status = cancelled`.
- **Tips, taxes, processor fees:** Not modeled in v1. Prices are all-inclusive.

---

## 11. Order Snapshot & Edit Behavior

Each `OrderItem` stamps the price and per-item cost **at submission time**, computed from the event's menu snapshot. This means:
- If the operator edits the event's snapshot mid-rush, already-submitted lines keep their original numbers.
- Historical event summaries are mathematically frozen against the event's frozen prices/costs.

### Editing a submitted order
- Long-press an order in the Barista Queue or Order History → enters edit mode
- Editable fields: items (add/remove/quantity/modifiers), payment status/method, comp reason, customer name, notes, **order status** (the only way to cancel)
- On save, the order's `updatedAt` is touched. No edit history UI in v1; v1 keeps only `updatedAt`.
- Concurrent edits: last write wins. No locking, no merging.

### Cancellation
There is no separate "Void" or "Cancel" button. To cancel: edit the order → set `status = cancelled`. The order remains visible in queue/history with a muted "Cancelled" badge and contributes nothing to revenue/quantity/cost.

---

## 12. Barista Queue Tab

### Sorting & visibility
- Default view: **pending + in-progress orders, oldest first**, single column.
- Below them, a collapsible section: "Completed today (N)" — collapsed by default; expand to inspect.
- Cancelled orders are hidden from the queue but shown in Order History.

### Order card (large, tablet-tuned)
- Order number (very large, top-left)
- Customer name (large, top-right)
- Timestamp + minutes-since-submit
- Status badge: Pending (amber) / In Progress (blue) / Completed (green) / Cancelled (gray)
- One row per `OrderItem` showing:
  - Quantity × item name (big)
  - Modifiers as compact chips (milk, sugar, ice, cream, special requests)
  - Per-drink checkbox: tap to toggle that drink to "done"
- Order-level actions: "Start" (sets order to in_progress) / "Complete all" / long-press to edit

### Per-drink completion
- Each `OrderItem` has its own `status` (pending / in_progress / done)
- When **all** items on an order are `done`, the order auto-flips to `completed` and slides into the Completed section.
- The barista does not have to use per-drink toggles — tapping "Complete all" does it for them.

### New-order signaling
- On arrival of a new order via Realtime: subtle ping sound (toggleable in Settings) + a brief 1.5s matcha-green border pulse on the card.
- No tab badge in v1.

---

## 13. Finance Tab

A read-mostly workspace for cost/margin work.

### Layout
Two sections, tabs or stacked:
1. **Ingredients** — table of every ingredient with name, package price, package amount, unit, derived `$/canonical unit`. Inline edit. Pool indicator (milk/cream).
2. **Per-item costs** — table of all active menu items showing: name, selling price, derived cost (with chosen default milk/cream), profit, margin %. Low-margin items show a warning icon (configurable threshold, default 30%).

Fixed costs for the **active event** are managed inline in the Event Summary tab (see §14), not here.

There is no "calculator" mode in v1; the math is always derived from the master ingredient + menu data.

---

## 14. Event Summary Tab

Per-event dashboard. The event picker at the top switches context.

### KPI row
- Total orders (paid / unpaid / comped / cancelled breakdown)
- Total cups/items sold
- Gross revenue (paid) + Owed (unpaid) — side by side
- Total ingredient cost
- Total fixed costs
- **Total profit** (highlighted)
- **Margin** (highlighted)
- Target revenue progress bar (if `targetRevenue` set)

### Per-item table
Columns: item, qty sold, selling price, revenue (paid), cost per item, total cost, profit, margin %, low-margin warning icon.

Highlights: best-selling item, most profitable item, low-margin items.

### Charts (Recharts)
1. **Bar — Quantity sold by item** (horizontal bar, sorted desc)
2. **Bar — Revenue & profit by item** (grouped vertical bars)
3. **Line — Orders over time of day** (binned by hour using `startTime`–`endTime`)

### Fixed costs (managed here)
A small editable table per event: name, amount. All entries are `event_only` allocation.

### CSV export button
See §15.

---

## 15. CSV Export

One CSV file per event. Item-level (one row per menu item that sold ≥ 1). Google Sheets friendly: human header names, numbers with 2-decimal formatting where appropriate, no currency symbol in cells.

Filename: `<event-name>-<YYYY-MM-DD>.csv`

Columns (in order):
1. Event Name
2. Event Date
3. Item Name
4. Category
5. Quantity Sold
6. Selling Price
7. Revenue (Paid)
8. Revenue Owed
9. Cost Per Item
10. Total Cost
11. Profit
12. Profit Margin %
13. Paid (Cash)
14. Paid (Venmo)
15. Paid (Zelle)
16. Paid (Card)
17. Paid (Other)
18. Comped Count

A summary row at the bottom totals columns 5, 7, 8, 10, 11.

No order-level CSV, no ingredient-level CSV, no zip bundle in v1.

---

## 16. Data Model

### Workspace
```ts
type Workspace = {
  id: string;
  code: string;        // 6-char shown as "MATCHA-XXXX" in UI, but stored as 6 chars
  createdAt: string;
};
```

All other tables have an implicit `workspaceId` foreign key; Supabase row-level filters scope every query.

### Event
```ts
type Event = {
  id: string;
  workspaceId: string;
  name: string;
  date: string;             // ISO date
  startTime: string;        // ISO time
  endTime: string;          // ISO time
  targetRevenue?: number;
  menuSnapshotId: string;
  isActive: boolean;        // exactly one true per workspace
  createdAt: string;
  updatedAt: string;
};
```

### MenuSnapshot
```ts
type MenuSnapshot = {
  id: string;
  workspaceId: string;
  // Frozen copies of all relevant rows at event-creation time:
  menuItems: MenuItemSnapshot[];
  ingredients: IngredientSnapshot[];
  fixedCosts: FixedCost[];
  createdAt: string;
};

type MenuItemSnapshot = {
  id: string;                   // stable across master + snapshot for lookup
  name: string;
  category: Category;
  price: number;
  size: Size;
  active: boolean;
  description?: string;
  ingredientLines: { ingredientId: string; amount: number; unit: Unit; }[];
  defaultMilkId?: string;
  defaultCreamId?: string;
  allowedMilkIds: string[];
  allowedCreamIds: string[];
};

type IngredientSnapshot = {
  id: string;
  name: string;
  packagePrice: number;
  packageAmount: number;
  unit: Unit;
  pool?: "milk" | "cream" | null;
};
```

### Master tables (editable in Menu Manager)
```ts
type MenuItem = MenuItemSnapshot & { createdAt: string; updatedAt: string; };
type IngredientMaster = IngredientSnapshot & { createdAt: string; updatedAt: string; };
```

### FixedCost
```ts
type FixedCost = {
  id: string;
  name: string;
  amount: number;
  allocationMethod: "event_only";   // only this value in v1
};
```

### Order
```ts
type Order = {
  id: string;
  workspaceId: string;
  eventId: string;
  orderNumber: number;              // per-event, 1-based
  customerName: string;
  items: OrderItem[];
  notes?: string;
  paymentStatus: "paid" | "unpaid" | "comped";
  paymentMethod?: "cash" | "venmo" | "zelle" | "card" | "other";
  compReason?: "friend" | "sample" | "mistake" | "other";
  status: "pending" | "in_progress" | "completed" | "cancelled";
  submittedAt: string;
  updatedAt: string;
};
```

### OrderItem
```ts
type OrderItem = {
  id: string;
  orderId: string;
  menuItemId: string;               // refers to snapshot's MenuItem.id
  menuItemNameSnap: string;         // for display robustness
  priceSnap: number;                // frozen at submission
  costSnap: number;                 // frozen at submission (includes chosen milk/cream)
  quantity: number;                 // always positive
  milkChoiceId?: string;            // chosen milk Ingredient id
  creamChoiceId?: string;           // chosen cream Ingredient id
  sugarAdjustment?: "less" | "normal" | "extra" | "no_agave";
  iceAdjustment?: "light" | "normal" | "extra";
  specialRequests?: string;
  status: "pending" | "in_progress" | "done";
};
```

### Settings (per workspace)
```ts
type Settings = {
  workspaceId: string;
  lowMarginThresholdPct: number;    // default 30
  baristaPingEnabled: boolean;      // default true
};
```

---

## 17. Calculation Reference

```
toCanonical(amount, unit):
  mass → g; volume → ml; count → unchanged

ingredientCostPerCanonicalUnit(ing):
  ing.packagePrice / toCanonical(ing.packageAmount, ing.unit)

ingredientLineCost(line, ing):
  ingredientCostPerCanonicalUnit(ing) * toCanonical(line.amount, line.unit)

orderItemCostSnap (computed at submission):
  for each line in menuItem.ingredientLines:
    if line.ingredient.pool == "milk":
       ing := snapshot.milk[orderItem.milkChoiceId ?? menuItem.defaultMilkId]
    elif line.ingredient.pool == "cream":
       ing := snapshot.cream[orderItem.creamChoiceId ?? menuItem.defaultCreamId]
       (skip if neither set)
    else:
       ing := line.ingredient
    sum += ingredientLineCost(line, ing)

orderItemPriceSnap (computed at submission):
  menuItem.price  (modifiers do not change price)

revenuePaid_i  = sum over paid orders of (priceSnap * quantity) for item i
revenueOwed_i  = sum over unpaid orders of (priceSnap * quantity) for item i
qty_i          = sum over non-cancelled orders of quantity for item i
totalCost_i    = sum over non-cancelled orders of (costSnap * quantity) for item i
profit_i       = revenuePaid_i - totalCost_i
margin_i       = revenuePaid_i > 0 ? profit_i / revenuePaid_i : null

eventRevenuePaid = sum(revenuePaid_i)
eventTotalCost   = sum(totalCost_i) + sum(fixedCost.amount)
eventProfit      = eventRevenuePaid - eventTotalCost
eventMargin      = eventRevenuePaid > 0 ? eventProfit / eventRevenuePaid : null
```

---

## 18. UI / Visual Direction

- **Theme:** cream/white background, subtle matcha-green (`#6F8F4A` or similar) as a single accent for primary buttons and active states. Mostly neutral, near-monochrome supporting text.
- **Typography:** clean sans-serif (Inter / system-ui). Generous sizes on Barista Queue.
- **Spacing:** generous touch targets (min 44pt). Cards rounded (`rounded-2xl`).
- **Status color discipline:** every status uses both a color and an icon/label (accessibility).
- **No dark mode in v1.**

---

## 19. Sample Data (seeded on first launch)

A button in Settings: "Reset sample data" reinstates this state at any time.

### Workspace
- Code: `MATCHA-DEMO`

### Ingredients (with `pool` where applicable)
| Name | Package $ | Package Amount | Unit | Pool |
|---|---|---|---|---|
| Matcha powder | 159 | 500 | g | — |
| Whole milk | 5.49 | 3785 | ml | milk |
| Oat milk | 6.99 | 946 | ml | milk |
| Lactose-free milk | 7.49 | 1893 | ml | milk |
| Almond milk | 5.99 | 1893 | ml | milk |
| Ube cream | 12.00 | 500 | ml | cream |
| Sesame cream | 11.00 | 500 | ml | cream |
| Banana cream | 9.00 | 500 | ml | cream |
| Strawberry cream | 9.00 | 500 | ml | cream |
| Plain cream | 7.00 | 500 | ml | cream |
| Agave | 8.99 | 660 | ml | — |
| 12oz cup | 24.00 | 100 | piece | — |
| 16oz cup | 28.00 | 100 | piece | — |
| Lid | 12.00 | 100 | piece | — |
| Straw | 6.00 | 250 | piece | — |
| Ice | 4.00 | 4000 | g | — |
| Strawberry purée | 7.00 | 500 | ml | — |
| Earl Grey leaves | 18.00 | 250 | g | — |
| Hojicha powder | 32.00 | 100 | g | — |
| Dubai chocolate spread | 15.00 | 500 | g | — |
| Cheesecake base | 0.80 | 1 | piece | — |

### Menu items (master, all active, default milk = Whole, default cream = Plain where applicable)
| Item | Category | Price | Size | Uses milk | Uses cream | Notes |
|---|---|---|---|---|---|---|
| Classic Matcha | matcha | 6.70 | 16oz | yes (180 ml) | no | + 4.5 g matcha, 5 ml agave, ice 50 g, 16oz cup, lid, straw |
| Strawberry Matcha | matcha | 6.90 | 16oz | yes (160 ml) | no | + matcha 4.5 g, strawberry purée 20 ml, agave 5 ml, ice 50 g, cup, lid, straw |
| Earl Grey Matcha | matcha | 6.90 | 16oz | yes (150 ml) | no | + matcha 3.5 g, earl grey 2 g, agave 5 ml, ice 50 g, cup, lid, straw |
| Ube Cream Matcha | matcha | 6.90 | 16oz | yes (160 ml) | yes (30 ml), default=Ube | + matcha 4.5 g, agave 5 ml, ice 50 g, cup, lid, straw |
| Hojicha Latte | hojicha | 6.50 | 12oz | yes (180 ml) | no | + hojicha 4 g, agave 5 ml, ice 40 g, 12oz cup, lid, straw |
| Hojicha Sesame Cream | hojicha | 6.90 | 12oz | yes (160 ml) | yes (30 ml), default=Sesame | + hojicha 4 g, agave 5 ml, ice 40 g, cup, lid, straw |
| Banana Cream Matcha | cream_top | 6.90 | 16oz | yes (160 ml) | yes (30 ml), default=Banana | + matcha 4.5 g, agave 5 ml, ice 50 g, cup, lid, straw |
| Dubai Chocolate Matcha | matcha | 7.60 | 16oz | yes (160 ml) | no | + matcha 4.5 g, chocolate 15 g, agave 5 ml, ice 50 g, cup, lid, straw |
| Matcha Cheesecake | pastry | 8.00 | pastry_count | no | no | + cheesecake base 1 piece |

### Sample past event
- **Name:** UCI Spring Pop-Up
- **Date:** 2026-05-18
- **Start:** 11:00, **End:** 16:00
- **Target revenue:** $400
- **Fixed costs:** Table fee $25, Permit $40, Transport $15
- **Orders:** 30 sample orders demonstrating: multi-item orders, oat-milk swap, cream swaps, comped (with each reason), unpaid, mixed payment methods, all statuses (one cancelled, one in-progress at "close").

---

## 20. User Flows

### Flow A — First-time setup
1. User opens app → "Create workspace" → code displayed (`MATCHA-XXXX`) + "Copy"
2. Sample data is pre-seeded. User lands on Event Summary for the demo event.
3. User can immediately explore, or "Reset sample data" + start fresh.

### Flow B — Adding a second device (barista tablet)
1. Tablet opens app → "Join workspace" → types code → joins.
2. Tablet remembers workspace forever. Both devices now see live updates.

### Flow C — Setting up a real event
1. Operator opens Menu Manager → reviews items, archives unused ones, adjusts prices/ingredients.
2. Goes to Event Summary → "+ New event" → enters name, date, start, end, target → Create.
3. Snapshot is captured. New event appears in picker. Operator taps "Set active."

### Flow D — Live order
1. Order taker opens Live Orders. Card grid visible.
2. Customer says "two strawberry matchas, one oat."
3. Taker taps Strawberry Matcha twice (two lines). Taps the first line → milk chip → Oat.
4. Customer says "extra ice on both" — taker opens Customize on each line, sets Ice → Extra.
5. Taker types name "Sam." Selects paymentStatus "paid" + method "Venmo." Hits Submit.
6. Order ping fires on barista's tablet within ~200ms. Card flashes green.

### Flow E — Barista preparation
1. Tablet shows order #14 at top of pending list.
2. Barista taps "Start" → status flips to in_progress.
3. Makes drink 1, taps its checkbox. Makes drink 2, taps its checkbox.
4. Order auto-flips to completed and slides into the Completed (collapsed) section.

### Flow F — Fixing a mistake
1. Customer says "actually I wanted oat, not whole."
2. On either device, long-press order #14 → edit mode.
3. Toggle the milk chip on the affected line. Save.
4. Cost snapshot recalculates; price unchanged.

### Flow G — End of event
1. Operator opens Event Summary for the active event.
2. Updates fixed costs (table fee, etc.) inline.
3. Reviews KPIs + charts.
4. Hits "Export CSV." File downloads.
5. Drags CSV into Google Sheets for personal records.

---

## 21. Edge Cases (resolved)

| Case | Behavior |
|---|---|
| Selling price = 0 | Allowed; margin shown as "n/a" |
| Two devices edit the same order simultaneously | Last write wins; no warning |
| Workspace code lost | Recoverable only if a paired device still has it; otherwise user must create new workspace (sample data only) |
| Trying to delete an item used in any order | Blocked; "Archive instead" toast |
| Editing master menu after event creation | No effect on existing events (frozen snapshots) |
| Changing default milk mid-event | Affects only orders submitted after the change; previous orders keep their snapshot |
| Comp without specifying reason | Submit disabled until reason chip selected |
| Pay status = paid but no method | Submit disabled until method selected |
| Order cancelled after drinks marked done | Status flips to cancelled; revenue/qty backed out; visible in history |
| Customer name blank | Submit disabled |
| Realtime channel disconnects mid-service | UI shows a small "Reconnecting…" banner; orders queued locally fire when reconnected (best-effort; no offline-first guarantees) |
| Unit mismatch (e.g. menu uses g, ingredient priced in oz) | Auto-converted within mass category |
| Cross-category unit mismatch (e.g. menu uses ml, ingredient priced in g) | Validation error in Menu Manager — user must align |
| Cream-using item but cream omitted at order time | Treated as "no cream" — cream ingredient line is skipped |

---

## 22. Persistence & Sync Plan

- **Postgres tables** mirror the data model in §16. Snapshot tables (`menu_snapshot`, etc.) are append-only.
- **Realtime**: one Supabase channel per workspace. Tables subscribed: `orders`, `order_items`, `events`, `settings`.
- **Optimistic UI**: order submission inserts locally + fires the mutation; rollback on failure with a toast.
- **No offline mode.** If the network drops mid-submit, the user sees an inline retry button.
- **Backups**: rely on Supabase's managed Postgres backups. No in-app export of full DB.

---

## 23. Implementation Milestones

1. **Skeleton** — Next.js app, Tailwind, shadcn/ui, Supabase project, schema migrations.
2. **Workspace + auth-less pairing** — create workspace, join workspace, persist `workspaceId` in `localStorage`.
3. **Master data: Ingredients + Menu Manager** — CRUD, derived cost computation, low-margin warning.
4. **Events + menu snapshot** — create event, freeze snapshot, active-event picker, sidebar indicator.
5. **Live Orders** — card grid, cart, modifier sheet, name/payment validation, submit.
6. **Barista Queue (Realtime)** — Supabase channel, per-drink toggles, auto-complete, ping + flash.
7. **Order editing & cancellation** — long-press edit, save, status flip.
8. **Finance tab** — Ingredients + per-item cost tables, low-margin warning.
9. **Event Summary + charts** — KPI row, per-item table, 3 Recharts views, fixed-costs editor.
10. **CSV export** — generator + file download.
11. **Sample data + reset** — seed script, settings reset button.
12. **Polish pass** — accessibility, responsive checks (phone/tablet/desktop), copy review.

---

## 24. Testing Checklist (manual)

- [ ] Create workspace, copy code, join from a second browser; both see the same data.
- [ ] Add a menu item with cream support; verify derived cost matches hand calc.
- [ ] Change a global ingredient price; verify it propagates to master menu cost but **not** to any existing event snapshot.
- [ ] Create an event; switch active; verify only that event accepts new orders.
- [ ] Take a 3-item order with two milk swaps and a comped item; verify Event Summary numbers.
- [ ] Submit an order on device A; verify ping + flash on device B within ~1s.
- [ ] Edit a submitted order on device A while device B is viewing it; verify last-write-wins.
- [ ] Mark all drinks in a multi-drink order done one-by-one; verify auto-complete.
- [ ] Cancel an order via edit; verify removed from revenue/qty/cost; verify still visible.
- [ ] Try to delete a menu item used in an order; verify block + "Archive instead" message.
- [ ] Export CSV; open in Google Sheets; verify column order, formatting, summary row.
- [ ] Force low-margin item by editing ingredient cost up; verify warning icon appears.
- [ ] Reset sample data; verify clean reseed.
- [ ] Resize: phone (bottom tabs), tablet (sidebar), desktop (sidebar); verify touch targets and layout.

---

## 25. Acceptance Criteria (v1 complete)

- Two devices share one workspace via a 6-char code, no login.
- An operator can plan future events, set an active event, and freeze a menu snapshot per event.
- The order taker can submit an order in under 15 seconds for a 1-drink, paid, oat-milk-swap scenario.
- The barista sees new orders within ~1 second of submission with a ping + flash.
- Per-drink completion auto-completes orders.
- Editing or cancelling an order via the inline edit flow recalculates the event totals correctly.
- Event Summary shows accurate KPIs and the three required charts.
- CSV export downloads a single Google-Sheets-friendly file matching the spec in §15.
- Low-margin items show a configurable warning icon.
- Sample data seeds on first launch and is resettable.
- App is usable on phone (bottom tabs), tablet (sidebar), and desktop (sidebar).
