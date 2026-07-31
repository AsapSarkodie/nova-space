import { API_BASE } from './api.js';

export const $ = (id) => document.getElementById(id);

// Uploaded photos are served by the Node server, so when the page is hosted on
// a different origin they need the API base in front of them.
export const asset = (u = '') => (u.startsWith('/') ? API_BASE + u : u);
export const money = (n) => `GHS ${Number(n).toLocaleString('en-GH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
export const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const COLLECTION = { all: 'Everything', resale: 'Resale', store: 'Store', essential: 'Deliver' };
// Catalogue number encodes the listing's real id — its place in the ledger.
export const catNo = (id) => `no. ${String(id).padStart(3, '0')}`;

// A photograph if the seller uploaded one, otherwise a typographic plate.
export const plate = (l, cls = '') => {
  if (l.image_url) return `<img src="${esc(asset(l.image_url))}" alt="${esc(l.title)}" loading="lazy" class="${cls}">`;
  return `<span class="mono ${cls}" aria-hidden="true">${esc((l.title || '?').trim().charAt(0).toUpperCase())}</span>`;
};

export function cardHtml(l) {
  const sold = l.status && l.status !== 'available';
  return `<article class="card" data-id="${l.id}">
    <div class="frame" data-open="${l.id}">
      ${plate(l)}
      <span class="no">${catNo(l.id)}</span>
      <span class="cat-tag">${esc(l.category || '')}</span>
      ${sold ? '<span class="sold-flag">sold</span>'
             : `<button class="add" data-add="${l.id}">Add to bag</button>`}
    </div>
    <div class="card-body">
      <p class="card-cat">${esc(COLLECTION[l.listing_type] || '')}</p>
      <h3 class="card-name" data-open="${l.id}">${esc(l.title)}</h3>
      ${l.condition ? `<p class="card-desc">${esc(l.condition)}</p>` : ''}
      <p class="card-price">${money(l.price)}${l.seller_verified ? ' <span class="verified">· verified</span>' : ''}</p>
    </div>
  </article>`;
}

export const gridHtml = (listings, empty) =>
  listings.length
    ? `<div class="grid">${listings.map(cardHtml).join('')}</div>`
    : `<div class="empty"><h3>${esc(empty.title)}</h3><p>${esc(empty.body)}</p></div>`;

/* ---------- overlays ---------- */
const modalRoot = $('modalRoot');
const drawer = $('drawer');

const lock = (on) => { document.body.style.overflow = on ? 'hidden' : ''; };

export function openModal(html) {
  $('modalBody').innerHTML = html;
  modalRoot.hidden = false;
  lock(true);
  modalRoot.querySelector('input,select,textarea,button:not(.modal-x)')?.focus();
}
export function closeModal() {
  modalRoot.hidden = true;
  $('modalBody').innerHTML = '';
  if (drawer.hidden) lock(false);
}
export function openDrawer() { drawer.hidden = false; lock(true); }
export function closeDrawer() { drawer.hidden = true; if (modalRoot.hidden) lock(false); }

// Any element marked data-close dismisses its overlay.
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) {
    if (e.target.closest('#drawer')) closeDrawer();
    else closeModal();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!modalRoot.hidden) closeModal();
  else if (!drawer.hidden) closeDrawer();
});

let tt;
export function toast(msg, kind = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast ${kind}`;
  t.hidden = false;
  clearTimeout(tt);
  tt = setTimeout(() => { t.hidden = true; }, 3000);
}
