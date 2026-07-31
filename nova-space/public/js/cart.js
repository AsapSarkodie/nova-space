// The bag. Lives in localStorage so it survives a refresh, and broadcasts
// a `cart:change` event so any view can stay in sync.

const KEY = 'nova_cart';
const bus = new EventTarget();

const read = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

const write = (items) => {
  localStorage.setItem(KEY, JSON.stringify(items));
  bus.dispatchEvent(new Event('cart:change'));
  return items;
};

export const cart = {
  onChange: (fn) => bus.addEventListener('cart:change', fn),
  items: read,

  // Resale and store items are one-of-a-kind, so they never stack.
  add(listing) {
    const items = read();
    const found = items.find((i) => i.id === listing.id);
    const unique = listing.listing_type !== 'essential';

    if (found) {
      if (unique) return { items, added: false, reason: 'already' };
      found.quantity = Math.min(20, found.quantity + 1);
    } else {
      items.push({
        id: listing.id,
        title: listing.title,
        price: Number(listing.price),
        category: listing.category,
        type: listing.listing_type,
        image: listing.image_url || null,
        quantity: 1,
      });
    }
    return { items: write(items), added: true };
  },

  setQty(id, quantity) {
    const items = read()
      .map((i) => (i.id === id ? { ...i, quantity: Math.max(0, Math.min(20, quantity)) } : i))
      .filter((i) => i.quantity > 0);
    return write(items);
  },

  remove: (id) => write(read().filter((i) => i.id !== id)),
  clear: () => write([]),
  count: () => read().reduce((n, i) => n + i.quantity, 0),
  subtotal: () => read().reduce((n, i) => n + i.price * i.quantity, 0),
  has: (id) => read().some((i) => i.id === id),
};
