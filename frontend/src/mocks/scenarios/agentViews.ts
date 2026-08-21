/* =========================================================================
   Shared mock scenarios — a seed AgentView + source page per task.
   Exercises the frozen agent-view contract and seeds the live-demo
   "raw vs translated / kept vs stripped" panels (Person 2). Only t01 is
   fleshed out here; add more as the live demo needs them.
   ========================================================================= */
import type { AgentView, PageSnapshot } from "@contracts";

/** Raw source page for t01 (shop). Deliberately noisy — nav, banners, scripts. */
export const RAW_PAGE_T01: PageSnapshot = {
  url: "http://localhost:3001/shop",
  html: `<header class="site-nav">…120 lines of nav, promo banner, cookie modal…</header>
<main>
  <div class="filters">color, price, size, brand</div>
  <ul class="grid">
    <li id="p1" class="card"><img/><span class="name">Blue Oxford Shirt</span><span class="price">$24</span><button id="add-p1">Add</button></li>
    <li id="p2" class="card"><img/><span class="name">Blue Linen Shirt</span><span class="price">$19</span><button id="add-p2">Add</button></li>
    <li id="p3" class="card"><img/><span class="name">Red Polo</span><span class="price">$15</span><button id="add-p3">Add</button></li>
  </ul>
</main>
<footer>…legal, social, newsletter…</footer>`,
  text: "Shop · New arrivals · Blue Oxford Shirt $24 · Blue Linen Shirt $19 · Red Polo $15 · Free shipping over $50 · Subscribe to our newsletter · © 2026",
};

/** Task-conditioned AgentView for t01 — only what the goal needs. */
export const AGENT_VIEW_T01: AgentView = {
  summary: "Product listing, 3 shirts. Filterable by colour and price. Goal wants the cheapest blue one.",
  relevant_content: [
    { id: "p1", text: "Blue Oxford Shirt, $24", meta: { price: 24, color: "blue" } },
    { id: "p2", text: "Blue Linen Shirt, $19", meta: { price: 19, color: "blue" } },
  ],
  actions: [
    {
      name: "add_to_cart",
      description: "Add a product to the cart",
      params: { product_id: { type: "string", required: true } },
      target_selector: "#add-{product_id}",
    },
  ],
};
