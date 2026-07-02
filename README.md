# Life OS v2

Single-container life-management web app. React 18 + Tailwind CSS v3 (Vite) on
the frontend, Node.js 20 + Express 5 backend, SQLite (better-sqlite3) for
storage. Serves on port **3030**. No auth — internal network only.

## Architecture

**Two package.json files, not a workspace.** The root `package.json` owns the
server dependencies; `client/package.json` owns the frontend. This was chosen
over npm workspaces because:

- The Docker build installs each independently (`npm ci` at root, then again in
  `client/`), so the layers cache cleanly and a client-only change doesn't
  invalidate the server dependency layer.
- Server (CommonJS) and client (ESM) have different module systems; keeping them
  in separate roots avoids `"type"` field conflicts.

In production Express serves the built client (`client/dist`) as static files
from the same origin, so **no CORS handling is needed anywhere**. In dev, Vite's
proxy forwards `/api/*` to the Express server (see `client/vite.config.js`).

```
life-os/
├── client/               React/Tailwind frontend (Vite)
│   ├── src/{main,App}.jsx, index.css
│   ├── index.html
│   ├── vite.config.js    dev proxy /api -> :3030, builds to client/dist
│   ├── tailwind.config.js
│   └── postcss.config.js
├── server/
│   ├── index.js          Express entry: init db, mount /api, serve client/dist
│   ├── db/init.js         SQLite connection + runs schema on boot (idempotent)
│   ├── db/schema.sql      All 5 tables
│   └── routes/status.js   GET /api/status
├── Dockerfile
├── .env.example
└── package.json          root = server deps + scripts
```

## Database

`server/db/init.js` opens (or creates) the SQLite file at `DB_PATH` (default
`/data/lifeos.db` in Docker), enables WAL + foreign keys, and runs
`schema.sql` on every boot. All DDL is `IF NOT EXISTS`, so startup is safe on
both fresh and existing volumes.

Tables: `dispatches`, `kanban_cards`, `kanban_card_log`,
`kanban_stage_dispatches`, `obsidian_sync_queue`.

## API

- `GET /api/status` — health snapshot. Checks the DB plus reachability of
  WealthCanvas, LEGO Studio, Obsidian (self-signed TLS tolerated), and the
  OpenClaw gateway. Each external check times out at 3s and degrades to
  `"error"` rather than throwing.

  ```json
  { "db": "ok", "wealthcanvas": "ok", "lego_studio": "ok",
    "obsidian": "ok", "openclaw": "ok" }
  ```

## Local development

```bash
cp .env.example .env        # adjust URLs; set DB_PATH=./data/lifeos.db locally
npm install                 # server deps
npm run client:install      # client deps
npm run dev:server          # Express on :3030 (--watch)
npm run dev:client          # Vite dev server, proxies /api -> :3030
```

Open the Vite URL it prints (default http://localhost:5173).

## Production / Docker

```bash
docker build -t life-os .
docker run -p 3030:3030 -v life-os-data:/data --env-file .env life-os
```

Then open http://localhost:3030.

## Scripts (root)

| Script                | What it does                                  |
|-----------------------|-----------------------------------------------|
| `npm start`           | Run the server (`node server/index.js`)       |
| `npm run dev:server`  | Server with `--watch` reload                  |
| `npm run dev:client`  | Vite dev server                               |
| `npm run build`       | Build the frontend into `client/dist`         |
| `npm run client:install` | Install client dependencies                |
