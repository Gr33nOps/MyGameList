# MyGameList

A game-tracking web app — a MyAnimeList-style site for video games. Browse a curated catalog (mods, demos, and low-quality entries filtered out by default), search with relevance-ranked results, keep a personal collection with statuses and ratings, build custom lists, and follow other users.

Game data is served from the [RAWG Video Games Database API](https://rawg.io/apidocs).

---

## Features

- **Smart browse** — Trending (recent + popular), Most Popular, Newest, Oldest, Name A–Z / Z–A, Coming Soon
- **Quality filter** (default on) — hides mods, demos, soundtracks, jam games, and unknown entries; tiered floor per sort so the page is never empty
- **Relevance-scored search** — `search_precise=true` to RAWG, ALL-tokens filter for multi-word queries, popularity-weighted reranker that strips leading articles ("the witcher" ranks as exact match for "witcher")
- **Personal collection** — Playing / Completed / Plan to Play / On Hold / Dropped + 1–10 score
- **Custom lists** — public or private, with covers, notes, and per-game status
- **Following** — see other users' public collections and lists
- **Moderation** — moderator and admin dashboards with activity logging
- **No external image-CDN dependency** — local CSS placeholders when a cover is missing

## Tech Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 18+ |
| HTTP | Express 5 |
| DB driver | Knex.js → Supabase Postgres |
| Auth | JWT + bcryptjs |
| Game data | [RAWG API](https://rawg.io/apidocs) |
| Frontend | Vanilla HTML / CSS / ES5-flavored JS — no framework, no build step |

## Prerequisites

- Node.js 18 or newer
- A [Supabase](https://supabase.com) project (Postgres database)
- A [RAWG API key](https://rawg.io/apidocs) (free tier — 20k requests/month)

## Setup

```bash
git clone <repo-url>
cd MyGameList
npm install
```

Create `.env` at the project root:

```env
DATABASE_URL=postgresql://postgres:<password>@db.<project>.supabase.co:5432/postgres
JWT_SECRET=<a-long-random-string>
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
RAWG_API_KEY=<your-rawg-key>
```

Run the database schema in your Supabase SQL editor (tables for `users`, `games`, `genres`, `platforms`, `publishers`, `developers`, junction tables, `user_game_lists`, `custom_lists`, `custom_list_games`, `moderator_activity`).

Start the server:

```bash
npm start        # production
npm run dev      # nodemon auto-reload
```

Visit <http://localhost:3000>.

## Project Structure

```
MyGameList/
├── Backend/                # Express server + route modules
│   ├── server.js           # entry point — mounts all routes, serves Frontend/
│   ├── auth.js             # /api/auth   — register, login, me, password reset
│   ├── home.js             # /api        — games catalog from local DB
│   ├── profile.js          # /api/user   — current user profile + settings
│   ├── myGameList.js       # /api/user   — user's collection + custom lists
│   ├── userProfile.js      # /api/users  — other users' profiles + public lists
│   ├── friends.js          # /api        — follow / unfollow / followers / activity feed
│   ├── moderator.js        # /api/moderator — moderation actions
│   ├── admin.js            # /api/admin  — full admin (user bans, role mgmt)
│   └── rawg.js             # /api/rawg   — RAWG API proxy (server-side key)
├── Frontend/               # static pages — served by express.static
│   ├── home.html / home.js
│   ├── auth.html / auth.js
│   ├── profile.html / profile.js
│   ├── myGameList.html / myGameList.js
│   ├── userProfile.html / userProfile.js
│   ├── friends.html / friends.js
│   ├── moderator.html / moderator.js
│   ├── admin.html / admin.js
│   └── styles.css
├── package.json
├── .env                    # not in git
└── README.md
```

## API Overview

| Mount path | Module | Purpose |
|---|---|---|
| `POST /api/auth/login`, `register`, `GET /api/auth/me` | [auth.js](Backend/auth.js) | JWT auth |
| `GET /api/games`, `GET /api/games/:id` | [home.js](Backend/home.js) | Local games DB |
| `GET/POST/PUT/DELETE /api/user/games`, `/lists` | [myGameList.js](Backend/myGameList.js) | Personal collection + custom lists |
| `GET/PUT /api/user/profile`, `/password` | [profile.js](Backend/profile.js) | Current user |
| `GET /api/users/:id`, `/lists`, `/games` | [userProfile.js](Backend/userProfile.js) | Other users (public view) |
| `GET/POST/DELETE /api/follow/...` | [friends.js](Backend/friends.js) | Social graph |
| `GET /api/rawg/games`, `/games/:id`, `/genres`, `/platforms`, `/publishers`, `/developers` | [rawg.js](Backend/rawg.js) | RAWG proxy (keeps API key server-side) |
| `/api/admin/*`, `/api/moderator/*` | [admin.js](Backend/admin.js), [moderator.js](Backend/moderator.js) | Mod tools |

## Scripts

```bash
npm start       # node Backend/server.js
npm run dev     # nodemon Backend/server.js
```

## Quality Filter Internals

When the "Quality only" toggle is on, the proxy adds:

- `parent_platforms=1,2,3,7` — PC / PlayStation / Xbox / Nintendo
- `stores=1,2,3,5,6,7,11` — Steam / Xbox / PSN / GOG / Nintendo eShop / Xbox 360 / Epic (dropped for Coming Soon and search)

And the client applies a **tiered popularity floor** per sort:

| Sort | Floor | Reason |
|---|---|---|
| Trending, Most Popular, Name A–Z / Z–A | **Strict**: `added ≥ 50 OR metacritic ≥ 60 OR ratings ≥ 30` | Sorts already surface real games |
| Newest, Oldest | **Weak**: drop only `added < 5 && !metacritic && ratings < 3` | Fresh releases haven't accumulated stats yet |
| Coming Soon | Weak | Unreleased games naturally have 0 ratings |

If a single RAWG page yields fewer than 20 quality games after filtering, [home.js](Frontend/home.js) fetches the next RAWG page automatically (up to 6 internal fetches per click) and accumulates results into a cache. Page navigation slices the cache; only forward navigation past the cache triggers more fetches.

## Search Logic

- Query < 4 chars (acronyms like `gta`, `re4`, `rdr`): trust RAWG fuzzy match — no precise flag, no token filter, no rerank
- Query ≥ 4 chars:
  - `search_precise=true` sent to RAWG
  - Token filter: results must contain **all** tokens in the name when 2+ tokens given
  - Reranker scores: exact match (5000) > article-stripped exact (5000) > prefix (3000) > substring (1500) > all tokens in name (800) > some tokens (200), plus `log10(added) * 100` for popularity tie-break

## Credits

Game data provided by **[RAWG](https://rawg.io)**. This product uses the RAWG Video Games Database API but is not endorsed or certified by RAWG.

## License

ISC
