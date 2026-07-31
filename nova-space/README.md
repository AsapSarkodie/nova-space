# Nova Space

A campus marketplace for KNUST, built as a catalogue:

- **Resale** — sell the electronics you can't carry home.
- **Store** — buy new and refurbished gear for less.
- **Deliver** — order essentials to your hostel.

**Node.js + Express** (ES modules), **PostgreSQL**, and a **vanilla HTML/CSS/JS** frontend served by the same process. No build step, no framework.

---

## Quick start

```bash
npm install
cp .env.example .env          # set your PG credentials and a JWT_SECRET
createdb nova_space           # or: CREATE DATABASE nova_space;
npm run db:setup              # schema + demo data
npm start                     # http://localhost:4000
```

**Demo login:** `ama.boateng@st.knust.edu.gh` / `password123`
Other demo accounts share the same password — see `server/db/seed.js`.

Health check: `GET /api/health` reports whether the database is reachable.

Requires Node 18+ (developed on Node 22) and PostgreSQL 13+.

---

## The two headline features

### Listing a product, with a photograph

The sell form takes a real image: click the dropzone or drag a file onto it, and you get an
instant preview before publishing.

- Handled by `multer` in `server/middleware/upload.js`
- **5 MB cap**, and only JPG / PNG / WEBP / GIF are accepted — anything else is refused with a clear message
- Files are written to `public/uploads/` under a randomised name (timestamp + random hex), so
  uploads can't overwrite each other or collide
- The path is stored on the listing as `image_url`, and served straight back as static content
- Listings without a photo fall back to a typographic plate rather than a broken image

`POST /api/listings` accepts `multipart/form-data`. The `image` field is optional — you can still
pass an `imageUrl` string instead.

### The bag

The cart lives in `localStorage` (`public/js/cart.js`), so it survives a refresh, and broadcasts a
`cart:change` event that every view listens to.

- **Resale and store items never stack** — they're one-of-a-kind, so adding one twice is a no-op
- **Essentials are restockable**, so those get quantity steppers (capped at 20)
- Checkout posts the whole bag to `POST /api/orders/checkout`, which runs in **one transaction**:
  every listing is locked with `SELECT … FOR UPDATE` in a stable id order, validated, and then
  written — or nothing is written at all
- If any item was sold a moment earlier, the whole checkout rolls back with a `409` naming the item
- **Delivery is charged once per checkout**, not per item, matching the batched last-mile economics
  in the business plan
- Baskets at or above `FREE_DELIVERY_OVER` (default GHS 300) ship free — the banner reads this
  from the server, so the claim on screen is always the rule actually applied
- Each checkout writes one order row per line, sharing a `group_id`

---

## Design

The interface is modelled on the editorial catalogue idiom: a warm paper ground, a taupe accent,
generous whitespace, and restrained motion. Second-hand goods are given the same typographic
treatment a luxury house gives its products — which is also the point of the business, since Nova
Space exists to recover value that currently gets thrown away.

- **Newsreader** for display and the italic condition lines; **Archivo** for UI labels and prices
- Every card carries a catalogue number (`no. 007`) that *is* the listing's database id
- Add-to-bag reveals on hover, and stays permanently visible on touch devices
- Responsive to 390px, keyboard focus is visible throughout, and `prefers-reduced-motion` is honoured

Fonts load from Google Fonts; if that's blocked the stack falls back to Georgia and the system sans.

---

## Layout

```
server/
  index.js              Express app: middleware, routes, static frontend
  config.js             Env config, student-email rule, delivery settings
  db/
    pool.js             pg pool + query helper
    schema.sql          users, listings, orders (idempotent — safe to re-run)
    seed.js             Applies schema, inserts demo data
  middleware/
    auth.js             JWT sign + requireAuth
    error.js            asyncHandler, 404, central error handler
    upload.js           multer: disk storage, size and mime limits
  routes/
    auth.js             register, login, me
    listings.js         browse/filter, detail, create (multipart), update, delete
    orders.js           single buy, cart checkout, purchases, sales, status
public/
  index.html            App shell
  css/styles.css        The whole visual system
  js/
    api.js              fetch client, token handling, multipart support
    cart.js             localStorage bag + change events
    ui.js               escaping, money, card markup, modal/drawer/toast
    app.js              State, views, event delegation
  uploads/              Uploaded photos (gitignored, folder kept)
```

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | – | Database reachability |
| GET | `/api/config` | – | Delivery fee and free-delivery threshold |
| POST | `/api/auth/register` | – | Create account (KNUST email ⇒ verified) |
| POST | `/api/auth/login` | – | Sign in, returns JWT |
| GET | `/api/auth/me` | ✓ | Current user |
| GET | `/api/listings` | – | Browse; `type,category,q,min,max,sort` |
| GET | `/api/listings/:id` | – | One listing |
| GET | `/api/listings/mine` | ✓ | Your listings |
| POST | `/api/listings` | ✓ | Create — `multipart/form-data`, optional `image` |
| PATCH | `/api/listings/:id` | ✓ | Edit your listing |
| DELETE | `/api/listings/:id` | ✓ | Remove your listing |
| POST | `/api/orders` | ✓ | Buy a single listing |
| POST | `/api/orders/checkout` | ✓ | Buy the whole bag, transactionally |
| GET | `/api/orders/mine` | ✓ | Your purchases |
| GET | `/api/orders/sales` | ✓ | Orders on your listings |
| PATCH | `/api/orders/:id/status` | ✓ | Advance or cancel an order |

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `4000` | Server port |
| `DATABASE_URL` | – | Full connection string (wins over `PG*`) |
| `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` | localhost defaults | Individual connection fields |
| `JWT_SECRET` | – | **Set a long random value in production** |
| `JWT_EXPIRES_IN` | `7d` | Session lifetime |
| `STUDENT_EMAIL_DOMAINS` | `st.knust.edu.gh,knust.edu.gh` | Domains that earn a verified badge |
| `DELIVERY_FEE` | `20` | Flat hostel delivery fee, GHS |
| `FREE_DELIVERY_OVER` | `300` | Subtotal at which delivery becomes free |

## Troubleshooting

**"Couldn't load the catalogue"** — the page isn't talking to the API. The app must be opened
*through the Node server*, not as a file and not from a separate static server:

```bash
npm start          # then open http://localhost:4000
```

Opening `public/index.html` directly, or serving it with VS Code Live Server (port 5500), means
`/api/*` never reaches Express and the app has no data to show. A console full of
`:5500/api/... 404 (Not Found)` is exactly this.

**If you want to keep Live Server** for its auto-reload, run both servers and point the frontend
at the API. In `public/js/api.js`:

```js
export const API_BASE = 'http://localhost:4000';
```

Then keep `npm start` running in a terminal and edit through Live Server as usual. CORS is already
enabled, and uploaded photos resolve against `API_BASE` too. Set it back to `''` before deploying.

Other messages tell you exactly what to fix:

| Message | Fix |
|---|---|
| Got a web page instead of data… | Open via `npm start`, not `index.html` directly |
| The database tables are missing… | `npm run db:setup` |
| That database does not exist… | `createdb nova_space`, then `npm run db:setup` |
| The database is unavailable… | Start PostgreSQL |
| Cannot reach the server… | The Node server isn't running |

Check `GET /api/health` — it returns `{"ok":true,"db":"connected"}` when everything is wired up.

## Notes

- Passwords are hashed with bcrypt; sessions are JWTs held in `localStorage`.
- `schema.sql` is idempotent (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`), so
  re-running the seed upgrades an existing database rather than breaking it.
- Uploaded files are gitignored but `public/uploads/.gitkeep` keeps the folder in the repo.

## Not built yet

Deliberately out of MVP scope, and the natural next milestones:

- Real MoMo / Paystack payment and escrow (checkout currently records the chosen method only)
- Image resizing and a CDN — files are stored at full size on local disk, which won't survive an
  ephemeral host; move to S3 or similar before deploying
- Rider assignment and delivery batching
- Email verification codes, and rate limiting on auth endpoints
