import { api, getToken, setToken, clearToken } from './api.js';
import { cart } from './cart.js';
import {
  $, money, esc, plate, catNo, COLLECTION, gridHtml, asset,
  openModal, closeModal, openDrawer, closeDrawer, toast,
} from './ui.js';

const state = {
  user: null,
  collection: 'all',
  q: '',
  sort: 'new',
  cfg: { deliveryFee: 20, freeDeliveryOver: 300 },
  listings: [],
};

const main = $('main');

/* ================= browse ================= */
const chrome = (show) => {
  $('hero').hidden = !show;
  document.querySelector('.collection-bar').hidden = !show;
};

async function browse() {
  chrome(true);
  $('collectionName').textContent = COLLECTION[state.collection];
  main.innerHTML = '<div class="empty"><p>Loading…</p></div>';
  try {
    const params = { sort: state.sort, q: state.q };
    if (state.collection !== 'all') params.type = state.collection;
    const { listings = [] } = await api.listings(params);
    state.listings = listings;
    $('collectionCount').textContent = `${listings.length} item${listings.length === 1 ? '' : 's'}`;
    main.innerHTML = gridHtml(listings, {
      title: 'Nothing in this collection yet',
      body: state.q ? 'Try another search.' : 'Be the first to list something here.',
    });
    // Stagger the reveal just enough to feel considered.
    main.querySelectorAll('.card').forEach((c, i) => {
      c.style.animationDelay = `${Math.min(i * 35, 420)}ms`;
    });
  } catch (e) {
    main.innerHTML = `<div class="empty"><h3>Couldn't load the catalogue</h3><p>${esc(e.message)}</p></div>`;
  }
}

/* ================= detail ================= */
async function openListing(id) {
  try {
    const { listing: l } = await api.listing(id);
    const sold = l.status !== 'available';
    const mine = state.user?.id === l.seller_id;
    openModal(`
      <div class="detail-frame">${plate(l)}<span class="no">${catNo(l.id)}</span></div>
      <p class="card-cat">${esc(COLLECTION[l.listing_type] || '')}</p>
      <h2>${esc(l.title)}</h2>
      ${l.condition ? `<p class="card-desc">${esc(l.condition)}</p>` : ''}
      <p class="detail-price">${money(l.price)}</p>
      <div class="meta-row">
        <span>${esc(l.category)}</span><span>·</span>
        <span>${esc(l.seller_name)}${l.seller_hostel ? `, ${esc(l.seller_hostel)}` : ''}</span>
        ${l.seller_verified ? '<span class="verified">· verified student</span>' : ''}
      </div>
      ${l.description ? `<p class="detail-desc">${esc(l.description)}</p>` : '<div style="height:20px"></div>'}
      ${sold ? '<p class="err">This piece has been sold.</p>'
        : mine ? '<p class="err">This is your own listing.</p>'
        : `<button class="btn" data-add="${l.id}" data-then="close">Add to bag</button>`}
    `);
  } catch (e) { toast(e.message, 'err'); }
}

/* ================= cart ================= */
function renderCart() {
  const items = cart.items();
  $('cartCount').textContent = cart.count();

  if (!items.length) {
    $('cartBody').innerHTML = '<div class="empty"><h3>Your bag is empty</h3><p>Everything you add appears here.</p></div>';
    $('cartFoot').hidden = true;
    return;
  }

  $('cartBody').innerHTML = items.map((i) => `
    <div class="line">
      ${i.image
        ? `<img class="line-img" src="${esc(asset(i.image))}" alt="${esc(i.title)}">`
        : `<div class="line-img line-mono">${esc(i.title.charAt(0).toUpperCase())}</div>`}
      <div>
        <p class="line-name">${esc(i.title)}</p>
        <p class="line-meta">${esc(COLLECTION[i.type] || '')} · ${esc(i.category || '')}</p>
        ${i.type === 'essential' ? `
          <div class="qty">
            <button data-qty="${i.id}" data-d="-1" aria-label="Reduce quantity">&minus;</button>
            <span>${i.quantity}</span>
            <button data-qty="${i.id}" data-d="1" aria-label="Increase quantity">+</button>
          </div>` : ''}
      </div>
      <div class="line-right">
        ${money(i.price * i.quantity)}
        <button class="line-rm" data-rm="${i.id}">Remove</button>
      </div>
    </div>`).join('');

  const sub = cart.subtotal();
  const free = sub >= state.cfg.freeDeliveryOver;
  const fee = free ? 0 : state.cfg.deliveryFee;

  $('cartFoot').hidden = false;
  $('cartFoot').innerHTML = `
    <div class="totals">
      <div><span>Subtotal</span><span>${money(sub)}</span></div>
      <div><span>Hostel delivery</span><span>${free ? 'Free' : money(fee)}</span></div>
      ${free ? '' : `<div><span>Free over ${money(state.cfg.freeDeliveryOver)}</span><span>${money(state.cfg.freeDeliveryOver - sub)} to go</span></div>`}
      <div class="grand"><span>Total</span><span>${money(sub + fee)}</span></div>
    </div>
    <button class="btn" id="checkoutBtn">Checkout</button>`;
}

function addToCart(id, opts = {}) {
  const listing = state.listings.find((l) => l.id === Number(id));
  const go = (l) => {
    const r = cart.add(l);
    if (!r.added && r.reason === 'already') return toast('Already in your bag.');
    toast(`${l.title} added to bag.`);
    if (opts.then === 'close') closeModal();
  };
  if (listing) return go(listing);
  api.listing(id).then(({ listing: l }) => go(l)).catch((e) => toast(e.message, 'err'));
}

/* ================= checkout ================= */
function openCheckout() {
  if (!state.user) return openAuth('login');
  if (!cart.items().length) return toast('Your bag is empty.');
  closeDrawer();

  const sub = cart.subtotal();
  const fee = sub >= state.cfg.freeDeliveryOver ? 0 : state.cfg.deliveryFee;

  openModal(`
    <h2>Checkout</h2>
    <p class="lead">${cart.count()} item${cart.count() === 1 ? '' : 's'} · ${money(sub + fee)}</p>
    <form id="coForm">
      <div class="err" id="coErr" hidden></div>
      <div class="f"><span>Fulfilment</span>
        <div class="seg">
          <label><input type="radio" name="ful" value="delivery" checked>Hostel delivery</label>
          <label><input type="radio" name="ful" value="pickup">Campus pickup</label>
        </div>
      </div>
      <div class="f" id="hostelF">
        <label for="coHostel">Hostel and room</label>
        <input id="coHostel" placeholder="Unity Hall, Room 214" value="${esc(state.user.hostel || '')}">
      </div>
      <div class="f"><span>Payment</span>
        <div class="seg">
          <label><input type="radio" name="pay" value="momo" checked>Mobile money</label>
          <label><input type="radio" name="pay" value="cash">Cash</label>
        </div>
      </div>
      <div class="totals">
        <div><span>Subtotal</span><span>${money(sub)}</span></div>
        <div id="feeRow"><span>Delivery</span><span>${fee ? money(fee) : 'Free'}</span></div>
        <div class="grand"><span>Total</span><span id="coTotal">${money(sub + fee)}</span></div>
      </div>
      <button class="btn" type="submit" id="coSubmit">Place order</button>
    </form>`);

  const form = $('coForm');
  const sync = () => {
    const delivery = form.ful.value === 'delivery';
    $('hostelF').hidden = !delivery;
    const f = delivery ? fee : 0;
    $('feeRow').innerHTML = `<span>Delivery</span><span>${delivery ? (f ? money(f) : 'Free') : '—'}</span>`;
    $('coTotal').textContent = money(sub + f);
  };
  form.querySelectorAll('[name=ful]').forEach((r) => r.addEventListener('change', sync));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('coSubmit');
    const err = $('coErr');
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Placing…';
    try {
      const res = await api.checkout({
        items: cart.items().map((i) => ({ listingId: i.id, quantity: i.quantity })),
        fulfilment: form.ful.value,
        paymentMethod: form.pay.value,
        hostel: $('coHostel')?.value || null,
      });
      cart.clear();
      closeModal();
      toast(`Order placed · ${money(res.total)}`);
      showOrders();
    } catch (e2) {
      err.textContent = e2.message;
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Place order';
    }
  });
}

/* ================= sell (with image upload) ================= */
function openSell() {
  if (!state.user) return openAuth('login');
  openModal(`
    <h2>List a piece</h2>
    <p class="lead">Sell it here instead of carrying it home.</p>
    <form id="sellForm">
      <div class="err" id="sellErr" hidden></div>

      <div class="f">
        <span>Photograph</span>
        <div class="drop" id="drop" role="button" tabindex="0">
          <div class="drop-txt"><b>Add a photo</b>Tap to choose, or drag one here. JPG, PNG or WEBP up to 5 MB.</div>
        </div>
        <input type="file" id="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
      </div>

      <div class="f"><label for="sTitle">Title</label>
        <input id="sTitle" required placeholder="Binatone standing fan"></div>

      <div class="f2">
        <div class="f"><label for="sType">Collection</label>
          <select id="sType">
            <option value="resale">Resale — used</option>
            <option value="store">Store — new or refurbished</option>
            <option value="essential">Deliver — essentials</option>
          </select></div>
        <div class="f"><label for="sCat">Category</label>
          <input id="sCat" required placeholder="Appliances"></div>
      </div>

      <div class="f2">
        <div class="f"><label for="sPrice">Price (GHS)</label>
          <input id="sPrice" type="number" min="0" step="1" required placeholder="90"></div>
        <div class="f"><label for="sCond">Condition</label>
          <input id="sCond" placeholder="Used — good"></div>
      </div>

      <div class="f"><label for="sDesc">Description</label>
        <textarea id="sDesc" placeholder="Age, why you're selling, where to collect it."></textarea></div>

      <button class="btn" type="submit" id="sellSubmit">Publish listing</button>
    </form>`);

  const drop = $('drop');
  const file = $('file');

  const preview = (f) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast('That file is not an image.', 'err');
    if (f.size > 5 * 1024 * 1024) return toast('That image is larger than 5 MB.', 'err');
    const url = URL.createObjectURL(f);
    drop.innerHTML = `<img src="${url}" alt="Selected photograph">
      <button type="button" class="drop-clear" id="dropClear">Change</button>`;
    $('dropClear').addEventListener('click', (e) => {
      e.stopPropagation();
      file.value = '';
      drop.innerHTML = '<div class="drop-txt"><b>Add a photo</b>Tap to choose, or drag one here. JPG, PNG or WEBP up to 5 MB.</div>';
    });
  };

  drop.addEventListener('click', () => file.click());
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); }
  });
  file.addEventListener('change', () => preview(file.files[0]));
  ['dragenter', 'dragover'].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    // Hand the dropped file to the input so the form submits it normally.
    const dt = new DataTransfer();
    dt.items.add(f);
    file.files = dt.files;
    preview(f);
  });

  $('sellForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('sellSubmit');
    const err = $('sellErr');
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Publishing…';
    try {
      const fd = new FormData();
      fd.append('title', $('sTitle').value);
      fd.append('listingType', $('sType').value);
      fd.append('category', $('sCat').value);
      fd.append('price', $('sPrice').value);
      fd.append('condition', $('sCond').value);
      fd.append('description', $('sDesc').value);
      if (file.files[0]) fd.append('image', file.files[0]);

      await api.createListing(fd);
      closeModal();
      toast('Your listing is live.');
      state.collection = 'all';
      state.q = '';
      $('q').value = '';
      syncNav();
      browse();
    } catch (e2) {
      err.textContent = e2.message;
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Publish listing';
    }
  });
}

/* ================= account ================= */
function openAuth(mode = 'login') {
  const login = mode === 'login';
  openModal(`
    <h2>${login ? 'Sign in' : 'Create an account'}</h2>
    <p class="lead">${login ? 'To buy, sell and follow your orders.' : 'A KNUST address earns a verified badge.'}</p>
    <form id="authForm">
      <div class="err" id="authErr" hidden></div>
      ${login ? '' : '<div class="f"><label for="aName">Full name</label><input id="aName" required placeholder="Ama Boateng"></div>'}
      <div class="f"><label for="aEmail">Email</label>
        <input id="aEmail" type="email" required placeholder="you@st.knust.edu.gh"></div>
      <div class="f"><label for="aPass">Password</label>
        <input id="aPass" type="password" required minlength="6" placeholder="At least 6 characters"></div>
      ${login ? '' : `<div class="f2">
        <div class="f"><label for="aPhone">Phone</label><input id="aPhone" placeholder="0244…"></div>
        <div class="f"><label for="aHostel">Hostel</label><input id="aHostel" placeholder="Unity Hall"></div>
      </div>`}
      <button class="btn" type="submit">${login ? 'Sign in' : 'Create account'}</button>
    </form>
    <p class="switch">${login ? 'New here?' : 'Already registered?'}
      <button id="authSwitch">${login ? 'Create an account' : 'Sign in'}</button></p>`);

  $('authSwitch').addEventListener('click', () => openAuth(login ? 'register' : 'login'));
  $('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('authErr');
    err.hidden = true;
    try {
      const body = { email: $('aEmail').value, password: $('aPass').value };
      if (!login) Object.assign(body, {
        name: $('aName').value, phone: $('aPhone').value, hostel: $('aHostel').value,
      });
      const data = login ? await api.login(body) : await api.register(body);
      setToken(data.token);
      state.user = data.user;
      syncAuth();
      closeModal();
      toast(`Signed in as ${data.user.name.split(' ')[0]}.`);
    } catch (e2) {
      err.textContent = e2.message;
      err.hidden = false;
    }
  });
}

function openAccount() {
  if (!state.user) return openAuth('login');
  openModal(`
    <h2>${esc(state.user.name)}</h2>
    <p class="lead">${esc(state.user.email)}${state.user.isStudentVerified ? ' · verified student' : ''}</p>
    <button class="btn btn-line" data-nav="orders">Your orders</button>
    <div style="height:10px"></div>
    <button class="btn btn-line" data-nav="mylistings">Your listings</button>
    <div style="height:10px"></div>
    <button class="btn btn-line" data-nav="sales">Sales</button>
    <div style="height:10px"></div>
    <button class="btn" id="signOut">Sign out</button>`);
  $('signOut').addEventListener('click', () => {
    clearToken();
    state.user = null;
    syncAuth();
    closeModal();
    toast('Signed out.');
    browse();
  });
}

/* ================= lists ================= */
const guard = () => (state.user ? true : (openAuth('login'), false));

// One place to show a load failure, so no view ever dies silently.
const fail = (heading, e) => {
  main.innerHTML = `<div class="empty"><h3>${esc(heading)}</h3><p>${esc(e.message)}</p></div>`;
};

async function showMyListings() {
  if (!guard()) return;
  chrome(false);
  main.innerHTML = '<div class="empty"><p>Loading…</p></div>';
  let listings = [];
  try { ({ listings = [] } = await api.myListings()); }
  catch (e) { return fail('Couldn\u2019t load your listings', e); }
  main.innerHTML = `<h2 class="sec-h">Your listings</h2>` + (listings.length
    ? `<div class="grid">${listings.map((l) => `
        <article class="card">
          <div class="frame">${plate(l)}<span class="no">${catNo(l.id)}</span>
            ${l.status !== 'available' ? `<span class="sold-flag">${esc(l.status)}</span>` : ''}</div>
          <div class="card-body">
            <h3 class="card-name">${esc(l.title)}</h3>
            <p class="card-price">${money(l.price)}</p>
            <button class="txt-btn" data-del="${l.id}" style="margin-top:8px;text-align:left">Remove</button>
          </div>
        </article>`).join('')}</div>`
    : '<div class="empty"><h3>No listings yet</h3><p>Use “Sell” to publish your first piece.</p></div>');
}

const orderRow = (o, role) => `
  <div class="order">
    <div class="order-main">
      <p class="order-name">${esc(o.title)}${o.quantity > 1 ? ` × ${o.quantity}` : ''}</p>
      <p class="order-meta">
        ${esc(role === 'buyer' ? o.seller_name : o.buyer_name)}
        · ${o.fulfilment === 'delivery' ? esc(o.hostel || 'Delivery') : 'Campus pickup'}
        · ${esc(String(o.payment_method).toUpperCase())} · ${money(o.total)}
      </p>
      <p style="margin-top:8px"><span class="pill ${esc(o.status)}">${esc(o.status.replace(/_/g, ' '))}</span></p>
    </div>
    <div class="order-actions">${orderActions(o, role)}</div>
  </div>`;

function orderActions(o, role) {
  if (role === 'seller') {
    const next = { placed: 'confirmed', confirmed: 'out_for_delivery', out_for_delivery: 'completed' }[o.status];
    const label = { confirmed: 'Confirm', out_for_delivery: 'Send out', completed: 'Complete' }[next];
    return next ? `<button class="txt-btn" data-status="${o.id}" data-next="${next}">${label}</button>` : '';
  }
  return ['placed', 'confirmed'].includes(o.status)
    ? `<button class="txt-btn" data-status="${o.id}" data-next="cancelled">Cancel</button>` : '';
}

async function showOrders() {
  if (!guard()) return;
  chrome(false);
  main.innerHTML = '<div class="empty"><p>Loading…</p></div>';
  let orders = [];
  try { ({ orders = [] } = await api.myOrders()); }
  catch (e) { return fail('Couldn\u2019t load your orders', e); }
  main.innerHTML = '<h2 class="sec-h">Your orders</h2>' + (orders.length
    ? orders.map((o) => orderRow(o, 'buyer')).join('')
    : '<div class="empty"><h3>No orders yet</h3><p>Anything you buy appears here.</p></div>');
}

async function showSales() {
  if (!guard()) return;
  chrome(false);
  main.innerHTML = '<div class="empty"><p>Loading…</p></div>';
  let orders = [];
  try { ({ orders = [] } = await api.mySales()); }
  catch (e) { return fail('Couldn\u2019t load your sales', e); }
  main.innerHTML = '<h2 class="sec-h">Sales</h2>' + (orders.length
    ? orders.map((o) => orderRow(o, 'seller')).join('')
    : '<div class="empty"><h3>No sales yet</h3><p>Orders for your listings appear here.</p></div>');
}

/* ================= wiring ================= */
const syncNav = () =>
  document.querySelectorAll('[data-collection]').forEach((b) =>
    b.classList.toggle('on', !!(b.dataset.collection === state.collection && b.closest('.head-nav'))));

const syncAuth = () => { $('accountBtn').textContent = state.user ? 'Account' : 'Sign in'; };

const NAV = {
  browse, sell: openSell, account: openAccount,
  orders: showOrders, mylistings: showMyListings, sales: showSales,
};

document.addEventListener('click', async (e) => {
  const t = e.target;

  const nav = t.closest('[data-nav]');
  if (nav) { closeModal(); return void NAV[nav.dataset.nav]?.(); }

  const col = t.closest('[data-collection]');
  if (col) {
    state.collection = col.dataset.collection;
    syncNav();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return void browse();
  }

  const add = t.closest('[data-add]');
  if (add) return void addToCart(add.dataset.add, { then: add.dataset.then });

  const open = t.closest('[data-open]');
  if (open) return void openListing(open.dataset.open);

  const rm = t.closest('[data-rm]');
  if (rm) { cart.remove(Number(rm.dataset.rm)); return; }

  const qty = t.closest('[data-qty]');
  if (qty) {
    const id = Number(qty.dataset.qty);
    const item = cart.items().find((i) => i.id === id);
    if (item) cart.setQty(id, item.quantity + Number(qty.dataset.d));
    return;
  }

  const del = t.closest('[data-del]');
  if (del && confirm('Remove this listing?')) {
    try { await api.deleteListing(del.dataset.del); toast('Listing removed.'); showMyListings(); }
    catch (err) { toast(err.message, 'err'); }
    return;
  }

  const st = t.closest('[data-status]');
  if (st) {
    try {
      await api.setOrderStatus(st.dataset.status, st.dataset.next);
      toast('Order updated.');
      main.querySelector('.sec-h')?.textContent === 'Sales' ? showSales() : showOrders();
    } catch (err) { toast(err.message, 'err'); }
  }
});

$('cartBtn').addEventListener('click', () => { renderCart(); openDrawer(); });
document.addEventListener('click', (e) => {
  if (e.target.id === 'checkoutBtn') openCheckout();
});

let timer;
$('q').addEventListener('input', (e) => {
  clearTimeout(timer);
  timer = setTimeout(() => { state.q = e.target.value.trim(); browse(); }, 250);
});
$('sort').addEventListener('change', (e) => { state.sort = e.target.value; browse(); });

cart.onChange(renderCart);

/* ================= init ================= */
(async function init() {
  renderCart();
  try { state.cfg = await api.config(); } catch { /* defaults are fine */ }
  $('announce').textContent = `Free hostel delivery on orders over ${money(state.cfg.freeDeliveryOver)}`;
  if (getToken()) {
    try { state.user = (await api.me()).user; } catch { clearToken(); }
  }
  syncAuth();
  browse();
})();
