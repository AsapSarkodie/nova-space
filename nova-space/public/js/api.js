// Where the API lives. Empty means "same origin as this page", which is what
// you want in both development and production — the paths below stay relative,
// so they work on localhost and on a real domain with no changes.
// Only set this if you deliberately serve the frontend from a DIFFERENT origin
// (e.g. a Vite dev server on 5173 talking to the API on 4000):
//   const API_BASE = 'http://localhost:4000';
export const API_BASE = 'https://58xknscq-4000.uks1.devtunnels.ms';

const KEY = 'nova_token';
export const getToken = () => localStorage.getItem(KEY);
export const setToken = (t) => localStorage.setItem(KEY, t);
export const clearToken = () => localStorage.removeItem(KEY);

async function req(path, { method = 'GET', body, auth = false, form = false } = {}) {
  const headers = {};
  if (body && !form) headers['Content-Type'] = 'application/json';
  if (auth && getToken()) headers.Authorization = `Bearer ${getToken()}`;

  let res;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers,
      body: form ? body : body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the server. Is it running?');
  }

  const type = res.headers.get('content-type') || '';
  const text = await res.text();
  let data = null;
  let unreadable = false;
  if (text) {
    try { data = JSON.parse(text); } catch { unreadable = true; }
  }

  // A non-JSON body almost always means the request never reached the API —
  // usually the page is being served by something other than the Node server.
  if (unreadable) {
    throw new Error(
      type.includes('text/html')
        ? 'Got a web page instead of data. Open the app through the Node server — run "npm start" and visit http://localhost:4000 rather than opening index.html directly.'
        : `The server sent a response this app could not read (${res.status}).`
    );
  }

  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status}).`);
  return data || {};
}

export const api = {
  config: () => req('/config'),

  register: (b) => req('/auth/register', { method: 'POST', body: b }),
  login: (b) => req('/auth/login', { method: 'POST', body: b }),
  me: () => req('/auth/me', { auth: true }),

  listings: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== '' && v != null)
    ).toString();
    return req(`/listings${qs ? `?${qs}` : ''}`);
  },
  listing: (id) => req(`/listings/${id}`),
  myListings: () => req('/listings/mine', { auth: true }),
  // formData carries the optional image file.
  createListing: (formData) =>
    req('/listings', { method: 'POST', body: formData, auth: true, form: true }),
  deleteListing: (id) => req(`/listings/${id}`, { method: 'DELETE', auth: true }),

  checkout: (b) => req('/orders/checkout', { method: 'POST', body: b, auth: true }),
  myOrders: () => req('/orders/mine', { auth: true }),
  mySales: () => req('/orders/sales', { auth: true }),
  setOrderStatus: (id, status) =>
    req(`/orders/${id}/status`, { method: 'PATCH', body: { status }, auth: true }),
};
