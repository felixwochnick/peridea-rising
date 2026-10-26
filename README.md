# Peridea Rising

Galaktisches Aufbau- und Handelsspiel im Browser: Planeten besiedeln, Rohstoffe handeln, Hyperraumrouten bauen – auf einem 3D-Board.
Solo gegen Bots und KI, Multiplayer über einen server-autoritativen Colyseus-Server, offline als installierbare PWA.

| Bereich | Technik |
| --- | --- |
| App | Nuxt 4 (SSR, Nitro `node-server`), Vue 3, Nuxt UI 4, Tailwind CSS 4 |
| 3D | TresJS / three.js, Modelle als glTF (`public/models`) |
| Auth | nuxt-auth-utils (versiegelte Session-Cookies), Authentik (OAuth2/OIDC) |
| Multiplayer | Colyseus 0.18 (WebSocket), JWT (HS256, jose) |
| Datenbank | PostgreSQL über postgres.js, eigene Migrationen |
| Offline | @vite-pwa/nuxt (Workbox `generateSW`) |
| Zufall | drand (quicknet), random.org (signiert), `crypto.getRandomValues` |

## Architektur

```
Browser ── HTTP(S) / WS(S) ──► dist/server.mjs  (multiplayer/serve.ts, ein Prozess, Port 3000)
  Service Worker                  ├─ /colyseus/*  → Colyseus (Prefix entfernt)
  (Precache, App-Shell)           │    ├─ /matchmake/*   HTTP-Matchmaking
  localStorage                    │    └─ Upgrade        WebSocket je Raum (GalacticRoom)
  (Einstellungen, Spielstand)     └─ alles andere → Nitro (Preset node-listener) ──► PostgreSQL
                                       /auth/authentik, /api/auth/*, /api/settings/:key, …
```

App und Multiplayer laufen in **einem** Prozess auf **einem** Port: [`multiplayer/serve.ts`](multiplayer/serve.ts) erzeugt den HTTP-Server und verteilt nach Pfad. Requests und WebSocket-Upgrades unter `/colyseus` gehen an Colyseus, das auf einem eigenen, nie lauschenden `http.Server` sitzt (`Server.serverless()`). So überdecken seine Routen (`/`, `/__healthcheck`, `/matchmake/*`) nicht die der App. Alle anderen Requests beantwortet Nitro. Der Client verbindet sich mit `<origin>/colyseus`: Bei `http://` nutzt er `ws://`, bei `https://` entsprechend `wss://`. Ein eigener Host oder Port für den Multiplayer ist nicht nötig.

Die Spiel-Engine (`shared/utils`) ist framework-neutral (nur `vue`-Reactivity) und läuft identisch im Browser (Solo) und im Multiplayer-Server. Im Multiplayer ist der Server autoritativ: Clients senden Aktionen, der Server prüft sie gegen die Regeln und verteilt den Zustand – verdeckte Karten der Mitspieler maskiert.

## Projektstruktur

```
app/                Nuxt-App (Pages, Layouts, Komponenten, Composables, Plugins)
server/             Nitro: API-Routen, Auth-Routen, Plugins, DB (server/db, server/utils/db.ts)
shared/utils/       Spiel-Engine, Bots, Karten, Würfel – von App und Multiplayer-Server genutzt
multiplayer/        serve.ts (Produktions-Einstieg: App + Multiplayer), server.ts (standalone), GalacticRoom.ts, auth.ts, dice.ts
public/             Statische Assets: Modelle, Texturen, Bilder, Schriften, PWA-Icons
blender/            Quelldateien der 3D-Modelle (nicht im Docker-Image)
```

## Entwicklung

Voraussetzungen: Node.js ≥ 22, pnpm in der Version aus `packageManager` (`corepack enable`).

```bash
pnpm install
cp .env.example .env
pnpm dev        # App, http://localhost:3000
pnpm dev:mp     # Multiplayer-Server standalone, ws://localhost:2567 (tsx watch)
```

Im Dev-Modus laufen App (Vite/Nitro-Dev-Server) und Multiplayer als zwei Prozesse; der Client verbindet sich dann mit `ws://localhost:2567`. Ohne `POSTGRES_HOST` startet die App im Dev-Modus ohne Datenbank; der Einstellungs-Sync antwortet dann mit `503`, Einstellungen bleiben lokal.

| Befehl | |
| --- | --- |
| `pnpm build` | App-Build nach `.output/` (inkl. Service Worker und prerenderter App-Shell) und `build:server` |
| `pnpm build:server` | Produktions-Einstieg `multiplayer/serve.ts` mit esbuild als ESM-Bundle nach `dist/server.mjs` (Colyseus gebündelt, lädt `.output/server/index.mjs` zur Laufzeit) |
| `pnpm preview` / `pnpm start` | Produktions-Build starten (`node dist/server.mjs`, mit bzw. ohne `.env`) |
| `pnpm build:mp` | Optional: Multiplayer-Server standalone nach `dist/multiplayer/server.mjs` |
| `pnpm lint` / `pnpm typecheck` | ESLint / `nuxt typecheck` |

## Konfiguration

Ausschließlich über Umgebungsvariablen (lokal `.env`, Vorlage `.env.example`).

| Variable | Verwendet von | Beschreibung |
| --- | --- | --- |
| `NUXT_SESSION_PASSWORD` | App | Schlüssel zum Versiegeln der Session-Cookies, ≥ 32 Zeichen. Im Dev-Modus automatisch erzeugt. |
| `NUXT_OAUTH_AUTHENTIK_CLIENT_ID` | App | Client-ID des OAuth2-Providers in Authentik |
| `NUXT_OAUTH_AUTHENTIK_CLIENT_SECRET` | App | Client-Secret |
| `NUXT_OAUTH_AUTHENTIK_DOMAIN` | App | Authentik-Host ohne Schema, z. B. `auth.example.com`. Redirect-URI: `<app>/auth/authentik` |
| `NUXT_MULTIPLAYER_SECRET` | App, Multiplayer | HMAC-Schlüssel (HS256) der Multiplayer-Tokens: die App signiert, der Colyseus-Server prüft. Muss auf beiden Seiten identisch sein; in Produktion Pflicht. |
| `NUXT_PUBLIC_MULTIPLAYER_URL` | App (Client) | Leer lassen (Standard): Produktion nutzt `<origin>/colyseus`, Entwicklung `ws://localhost:2567`. Nur für einen separat betriebenen Multiplayer-Server setzen, z. B. `wss://mp.example.com`. |
| `POSTGRES_HOST` | App | Datenbank-Host. In Produktion Pflicht, ohne ihn startet die App nicht. |
| `POSTGRES_PORT` | App | Standard `5432` |
| `POSTGRES_USER` | App | |
| `POSTGRES_PASSWORD` | App | |
| `POSTGRES_DB` | App | |
| `PORT` | Server | Listen-Port, Standard `3000` (`dist/server.mjs`) bzw. `2567` (Multiplayer standalone) |
| `HOST` | Server | Bind-Adresse, im Docker-Image `0.0.0.0` |
| `NITRO_ENTRY` | Server | Pfad zum Nitro-Build, Standard `.output/server/index.mjs` (relativ zum Arbeitsverzeichnis) |
| `MULTIPLAYER_DICE` | Multiplayer | `local`: lokaler Zufall statt drand (Entwicklung ohne Internet) |

## Authentifizierung

- **Gast (Solo):** `POST /api/auth/anonymous` legt eine Session `guest-<uuid>` an (`provider: 'anonymous'`).
- **SSO:** `/auth/authentik` (OIDC-Flow von nuxt-auth-utils) setzt eine Session `authentik:<sub>` mit 30 Tagen Laufzeit und legt den Nutzer per Upsert in `users` an.
- **Multiplayer:** `GET /api/auth/colyseus-token` stellt für SSO-Sessions ein JWT aus (HS256, `iss: peridea-rising`, `aud: multiplayer`, `sub` = User-ID, 1 h gültig). Der Colyseus-Server prüft es in `GalacticRoom.onAuth`.
- **Offline:** Ist der Server nicht erreichbar, setzt `app/plugins/offline.client.ts` eine lokale Gast-Session (`id: 'offline'`). Sobald der Server wieder antwortet, wird sie durch die Cookie-Session oder eine neue Gast-Session ersetzt.

## Multiplayer

`GalacticRoom` (max. 6 Clients) durchläuft zwei Phasen:

1. **Lobby:** Der Host konfiguriert Sitze, Karte und Regeln (`config`), Mitspieler treten per Lobby-Code bei und wählen Seite und Farbe (`seat`), der Host startet (`start`).
2. **Partie:** Clients senden `action` mit `{ name, args }`. Der Server führt die Aktion im Namen des sendenden Spielers aus; jede Regel prüft die Engine. Bots ziehen serverseitig (`gameDriver`).

Verbindungsabbrüche: Reconnect innerhalb von 30 s (Lobby) bzw. 180 s (Partie), danach übernimmt ein Bot den Sitz.

## Würfel

| Quelle | Verfahren | Nachprüfbar |
| --- | --- | --- |
| drand | Würfel = `sha256("<randomness>:<gameId>:<rollIndex>")` einer Runde, die bei der Anfrage noch nicht existierte (quicknet, alle 3 s) | ja |
| random.org | Signed API, Signatur wird im Würfelprotokoll gespeichert und kann geprüft werden | ja |
| lokal | `crypto.getRandomValues` | nein |

Ist die gewählte Quelle nicht erreichbar (oder der Client offline), wird lokal gewürfelt und der Wurf im Protokoll als Ersatz markiert.

## Datenbank

Beim Start (`server/plugins/database.ts`) verbindet sich die App und führt fehlende Migrationen aus [`server/db/migrations.ts`](server/db/migrations.ts) aus:

- alle ausstehenden Migrationen in **einer** Transaktion, in Reihenfolge der Liste
- `pg_advisory_xact_lock` – bei mehreren gleichzeitig startenden Instanzen migriert nur eine
- angewendete IDs stehen in `schema_migrations (id, applied_at)`
- schlägt eine Migration fehl, beendet sich der Prozess mit Exit-Code 1 (der Container startet neu, statt mit veraltetem Schema zu laufen)
- Requests, die die DB brauchen, warten über `useDb()` auf den Abschluss der Migration

Neue Schemaänderung: Eintrag `{ id: '0003_<name>', sql }` ans Ende der Liste anhängen. Veröffentlichte Migrationen nie ändern oder entfernen.

| Tabelle | Inhalt |
| --- | --- |
| `users` | SSO-Konten: `id` (`authentik:<sub>`), `provider`, `name`, `email`, `avatar`, `created_at`, `last_login_at` |
| `user_settings` | Einstellungsgruppen je Konto: `(user_id, key)` → `value jsonb`, `updated_at` |

## Einstellungs-Sync

Einstellungen sind offline-first: Die Quelle der Wahrheit im Client ist `localStorage`, mit SSO-Konto wird zusätzlich mit der Datenbank synchronisiert (`app/composables/useSyncedSettings.ts`).

| Endpunkt | |
| --- | --- |
| `GET /api/settings/:key` | gespeicherte Kopie `{ value, updatedAt }` oder `null` |
| `PUT /api/settings/:key` | Body `{ value, updatedAt }`; wird nur übernommen, wenn neuer als die gespeicherte Kopie. Antwort: die danach gespeicherte Kopie. |

Nur für SSO-Sessions (`403` sonst), `key` muss `^[a-z0-9-]{1,64}$` entsprechen, `value` maximal 32 KB.

- **Konfliktlösung:** Last-Write-Wins über den Zeitstempel der letzten Änderung (Client-Uhr; Werte mehr als 60 s in der Zukunft kappt der Server auf „jetzt“).
- **Änderungen:** werden sofort lokal gespeichert, als `pending` markiert (`<key>-sync` in `localStorage`) und nach 1 s Debounce per `PUT` gesendet. Netzwerkaufrufe laufen in einer Queue.
- **Abgleich (`GET`):** beim Login, beim Event `online` und wenn der Tab wieder sichtbar wird. Ausstehende Änderungen werden dabei nachgesendet.
- **Kontowechsel im selben Browser:** Die Kopie des vorherigen Kontos gilt als älteste – die Serverkopie des neuen Kontos gewinnt.
- **Nur lokal:** API-Schlüssel (KI-Anbieter, random.org) werden vor dem Senden entfernt und beim Übernehmen einer Serverkopie aus dem Browser ergänzt.

Gruppen: `sw-user-settings` (Zufallsquelle, KI-Konten), `gc-settings` (Grafik, Steuerung). Spielstände liegen nur im Browser.

## PWA & Offline

Service Worker aus `@vite-pwa/nuxt` (`registerType: 'prompt'`, Update-Prüfung stündlich):

| Anfrage | Strategie |
| --- | --- |
| JS, CSS, Schriften, Modelle, Texturen, Bilder, Icons, Manifest | Precache beim Installieren (~35 MB, Einzeldatei bis 16 MB) |
| Navigation (Seiten) | `NetworkOnly` – SSR-Seiten enthalten die Session und werden nie gecacht. Fehlschlag → precachte App-Shell |
| `/api/_nuxt_icon/*` | `StaleWhileRevalidate` (Reserve; die genutzten Icons sind im Client-Bundle) |
| sonstige `/api/*` | kein Cache |

Die App-Shell ist die Route `/app-shell` (`ssr: false`, beim Build prerendert). Offline wird sie für jede URL ausgeliefert; der Vue-Router rendert dann die eigentliche Seite rein clientseitig.

Ob der Server erreichbar ist, prüft `app/plugins/offline.client.ts` per Request an `/api/_auth/session` – `navigator.onLine` allein ist in Netzen ohne Internet `true`. Offline gilt: kein SSO, kein Multiplayer, Würfel lokal. Ein Update des Service Workers wird als Toast angeboten statt automatisch neu zu laden, damit laufende Partien nicht abbrechen.

Service Worker benötigen HTTPS (Ausnahme: `localhost`).

## Build & Deployment

### Docker-Image

Multi-Stage-Build auf `node:24-slim` ([`Dockerfile`](Dockerfile)):

- **Build-Stage:** `pnpm install --frozen-lockfile`, `pnpm build`
- **Runtime-Stage:** nur `.output/` und `server.mjs`, läuft als User `node`, `NODE_ENV=production`, `CMD ["node", "server.mjs"]`

```bash
# App + Multiplayer (/colyseus), Port 3000
docker run --env-file .env -p 3000:3000 ghcr.io/felixwochnick/peridea-rising
```

[`docker-compose.example.yml`](docker-compose.example.yml) enthält eine vollständige Umgebung (App mit Multiplayer, PostgreSQL mit Healthcheck).

Für HTTPS einen TLS-terminierenden Reverse Proxy davorsetzen, der WebSocket-Upgrades durchreicht (`Upgrade`/`Connection`-Header; bei Traefik und Caddy Standard, bei nginx `proxy_http_version 1.1` + `proxy_set_header Upgrade $http_upgrade` + `proxy_set_header Connection "upgrade"`). HTTPS ist Voraussetzung für die PWA; per HTTP funktionieren App und Multiplayer ebenfalls, nur ohne Service Worker (außer auf `localhost`).

### CI

| Workflow | Auslöser | |
| --- | --- | --- |
| [`ci.yml`](.github/workflows/ci.yml) | jeder Push | Lint, Typecheck |
| [`docker.yml`](.github/workflows/docker.yml) | Tag `v*.*.*` gepusht | Image für `linux/amd64` + `linux/arm64` (Buildx/QEMU, GHA-Cache) nach `ghcr.io/felixwochnick/peridea-rising` |

Image-Tags aus dem Git-Tag (SemVer): `1.2.3`, `1.2`, `1` und `latest`. Pre-Release-Tags (`v1.3.0-rc.1`) erzeugen nur `1.3.0-rc.1`.

```bash
git tag v1.2.3 && git push origin v1.2.3
```

## Lizenz & Rechtliches

Der Quellcode steht unter der [MIT-Lizenz](LICENSE). Sie gilt nur für den Code und räumt keine Rechte an Marken oder Werken Dritter ein.

Dies ist ein nicht-kommerzielles Fanprojekt. Es steht in keiner Verbindung zu Lucasfilm Ltd., The Walt Disney Company oder CATAN GmbH und wird von ihnen weder unterstützt noch gesponsert. „Star Wars“ und zugehörige Namen sind Marken von Lucasfilm Ltd. bzw. Disney, „CATAN“ ist eine Marke der CATAN GmbH.

Die Schriftarten in `public/fonts` stammen von Dritten und unterliegen deren eigenen Lizenzen.
