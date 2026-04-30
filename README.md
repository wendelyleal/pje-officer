# pje-officer

Minimal Bun implementation that emulates the browser-facing `pjeoffice-pro` local server for **certificate validation only**.

## What is implemented

- Bun local server with `pjeoffice-pro` compatible endpoints:
  - `POST /pjeOffice/`
  - `GET /pjeOffice/versao/`
  - `POST /pjeOffice/requisicao/?r=...`
  - `POST /pjeOffice/logout/`
- Loopback-local behavior (`127.0.0.1`) and CORS headers expected by browser integrations.
- Task support focused on certificate validation:
  - `cnj.autenticador`
  - `sso.autenticador`
  - `cnj.certchain`
- Certificate storage in SQLite (`bun:sqlite`).
- CLI to add/list/update/remove A1 certificates (`.pfx/.p12` + password).
- Minimal React UI for config/testing using:
  - React
  - nuqs (state persisted in URL: filters, selected item, modal/edit state)
  - Tailwind CSS
  - shadcn-style UI components
  - dark mode by default

> File signing and non-validation features are intentionally not implemented.

## Requirements

- Bun `>= 1.3`
- OpenSSL available in PATH (used to read A1 certificate metadata from PFX)

## Install

```bash
bun install
cd ui && bun install && cd ..
```

## Run server

```bash
bun run src/index.ts serve --port 8800 --db ./data/pje-officer.sqlite
```

Server endpoint base: `http://127.0.0.1:8800/pjeOffice/`

## CLI usage

Add certificate:

```bash
bun run src/index.ts cert add --name "Meu A1" --file /path/certificado.pfx --password "senha"
```

List certificates:

```bash
bun run src/index.ts cert list
```

Update certificate:

```bash
bun run src/index.ts cert update --id 1 --name "Novo Nome"
# With new file/password
bun run src/index.ts cert update --id 1 --file /path/novo.pfx --password "nova-senha"
```

Remove certificate:

```bash
bun run src/index.ts cert remove --id 1
```

## UI (demo/config)

Start server in one terminal:

```bash
bun run src/index.ts serve
```

Start UI in another terminal:

```bash
bun run ui:dev
```

Open: `http://127.0.0.1:5173`

UI state is URL-based via nuqs (`search`, `selected`, `add`, `edit`).

## Build & test

```bash
bun test
bun run build
bun run ui:build
cd ui && bun run lint
```
