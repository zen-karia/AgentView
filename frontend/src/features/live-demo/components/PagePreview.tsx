export function PagePreview() {
  return (
    <div className="live-browser" aria-label="Mock human-facing shop page">
      <div className="live-browser__chrome">
        <span className="live-browser__dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="live-browser__url">localhost:3001/shop</span>
        <span className="live-browser__menu" aria-hidden="true">•••</span>
      </div>
      <div className="live-shop">
        <div className="live-shop__promo">Free shipping over $50 · New customers save 10%</div>
        <div className="live-shop__nav">
          <strong>NORTH/LINE</strong>
          <span>New &nbsp; Shirts &nbsp; Essentials</span>
          <span>Search &nbsp; Cart (0)</span>
        </div>
        <div className="live-shop__hero">
          <span>Summer edit</span>
          <strong>Everyday shirts.</strong>
          <small>Considered staples for warmer days.</small>
        </div>
        <div className="live-shop__body">
          <aside>
            <strong>Filters</strong>
            <span>Colour</span><span>Price</span><span>Size</span><span>Brand</span>
          </aside>
          <div className="live-product-grid">
            <article>
              <div className="live-product-art live-product-art--blue"><span>01</span></div>
              <strong>Blue Oxford Shirt</strong><small>$24</small><button type="button">Add</button>
            </article>
            <article className="live-product--target">
              <div className="live-product-art live-product-art--linen"><span>02</span></div>
              <strong>Blue Linen Shirt</strong><small>$19</small><button type="button">Add</button>
            </article>
            <article>
              <div className="live-product-art live-product-art--red"><span>03</span></div>
              <strong>Red Polo</strong><small>$15</small><button type="button">Add</button>
            </article>
          </div>
        </div>
        <div className="live-cookie">
          <span>We use cookies to improve your shopping experience.</span>
          <button type="button">Accept all</button>
        </div>
      </div>
    </div>
  );
}
