"""Generate size-bucketed shop HTML sites (file:// targets for PlaywrightDriver AND
the Playwright-MCP runner). Products mirror driver.build_products(n) so the fake
driver, the real Playwright pages, and MCP all see the same catalog.

  python3 gen_sites.py        # writes sites/shop_15|60|200/index.html

Exposes window.__PRODUCTS__, window.__CART__, and window.__STATE__ = {cart, products}
so both PlaywrightDriver.state() and MCP's browser_evaluate read the same shape.
"""
from __future__ import annotations

import json
import pathlib

from driver import build_products

SIZES = [15, 60, 200]
_SITES_DIR = pathlib.Path(__file__).parent / "sites"

_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>DemoShop ({n} items)</title>
  <style>
    body {{ font-family: system-ui, sans-serif; margin: 0; }}
    nav a {{ margin-right: 12px; }}
    .grid {{ list-style: none; display: flex; flex-wrap: wrap; gap: 8px; padding: 8px; }}
    .product-card {{ border: 1px solid #ddd; padding: 8px; width: 200px; }}
    .price {{ font-weight: 600; }}
    footer div {{ display: inline-block; margin-right: 12px; color: #666; }}
  </style>
</head>
<body>
  <nav>
    <a href="/">Home</a><a href="/deals">Deals</a><a href="/new">New</a>
    <a href="/account">Account</a><a href="/cart">Cart</a>
  </nav>
  <div style="display:none">
    best shirts online cheap shirts blue shirts red shirts discount apparel
    free shipping trending fashion 2026 buy now limited stock
  </div>
  <h1>Shop</h1>
  <aside class="filters">Filter by: color, price, size, brand</aside>
  <ul id="grid" class="grid"></ul>
  <div id="cart">Cart: <span id="cart-items"></span></div>
  <footer>
    <div>About</div><div>Careers</div><div>Privacy Policy</div><div>Terms</div>
    <div>Returns</div><div>Contact</div>
    <p>&copy; 2026 DemoShop Inc. Free shipping over $50.</p>
  </footer>
  <script>
    window.__PRODUCTS__ = {products_json};
    window.__CART__ = [];
    window.__STATE__ = {{ cart: window.__CART__, products: window.__PRODUCTS__ }};
    function add(id) {{
      window.__CART__.push(id);
      document.getElementById('cart-items').textContent = window.__CART__.join(', ');
    }}
    const grid = document.getElementById('grid');
    window.__PRODUCTS__.forEach(function (p) {{
      const li = document.createElement('li');
      li.className = 'product-card';
      li.dataset.color = p.color;
      li.innerHTML =
        '<span class="name">' + p.name + '</span> - ' +
        '<span class="price">$' + p.price + '</span> (' + p.color + ') ' +
        '<button id="add-' + p.id + '" onclick="add(\\'' + p.id + '\\')">Add to cart</button>';
      grid.appendChild(li);
    }});
  </script>
</body>
</html>
"""


def main() -> None:
    for n in SIZES:
        products = build_products(n)
        html = _TEMPLATE.format(n=n, products_json=json.dumps(products))
        out = _SITES_DIR / f"shop_{n}" / "index.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(html)
        print(f"wrote {out}  ({n} items, {len(html)} bytes)")


if __name__ == "__main__":
    main()
