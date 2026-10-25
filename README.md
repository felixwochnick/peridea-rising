# Peridea Rising

Ein galaktisches Aufbau- und Handelsspiel: Planeten besiedeln, Rohstoffe handeln, Hyperraumrouten bauen – auf einem 3D-Board im Browser.
Mit mehreren Sternenkarten, einer optionalen Erweiterung mit Waren und Flotten, Bots und KI-Spielern sowie Multiplayer.

- **Solo** – anonym, ohne Konto, gegen Bots und KI
- **Multiplayer** – mit SSO-Konto (Authentik), über einen eigenen Colyseus-Server
- **Offline** – als installierbare PWA spielbar, auch ohne Internet (solo)
- **Nachprüfbare Würfel** – lokal, [drand](https://drand.love) oder signiert über random.org

Gebaut mit Nuxt 4, Nuxt UI, TresJS (three.js), Colyseus und PostgreSQL.

## Entwicklung

Voraussetzungen: Node.js 22+, pnpm (Version aus `package.json`, z. B. über `corepack enable`).

```bash
pnpm install
cp .env.example .env   # Werte ausfüllen, siehe unten
pnpm dev               # App auf http://localhost:3000
pnpm dev:mp            # Multiplayer-Server auf ws://localhost:2567 (nur für Multiplayer nötig)
```

Ohne `POSTGRES_HOST` läuft die App in der Entwicklung ohne Datenbank (Einstellungen werden dann nur im Browser gespeichert).

| Befehl | |
| --- | --- |
| `pnpm build` | Produktions-Build der App nach `.output/` |
| `pnpm build:mp` | Multiplayer-Server als einzelne Datei nach `dist/multiplayer/server.mjs` |
| `pnpm preview` | Produktions-Build lokal starten |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript |

## Konfiguration

Alle Einstellungen kommen aus Umgebungsvariablen (lokal aus `.env`):

| Variable | Beschreibung |
| --- | --- |
| `NUXT_SESSION_PASSWORD` | Schlüssel für die Session-Cookies, mind. 32 Zeichen (in der Entwicklung automatisch erzeugt) |
| `NUXT_OAUTH_AUTHENTIK_CLIENT_ID` | OAuth2-Client in Authentik |
| `NUXT_OAUTH_AUTHENTIK_CLIENT_SECRET` | |
| `NUXT_OAUTH_AUTHENTIK_DOMAIN` | Authentik-Domain ohne `https://`; Redirect-URI: `<app>/auth/authentik` |
| `NUXT_MULTIPLAYER_SECRET` | Gemeinsames Geheimnis von App und Multiplayer-Server (signiert die Spieler-Tokens) |
| `NUXT_PUBLIC_MULTIPLAYER_URL` | Adresse des Multiplayer-Servers für den Browser, z. B. `wss://mp.example.com` |
| `POSTGRES_HOST` | PostgreSQL-Host (in Produktion Pflicht) |
| `POSTGRES_PORT` | Standard `5432` |
| `POSTGRES_USER` | |
| `POSTGRES_PASSWORD` | |
| `POSTGRES_DB` | |
| `PORT` | Port des Servers (App `3000`, Multiplayer `2567`) |
| `MULTIPLAYER_DICE` | `local`: Multiplayer-Server würfelt lokal statt über drand |

## Datenbank

Die App legt ihre Tabellen beim Start selbst an und migriert sie bei Updates automatisch – es gibt keinen manuellen Schritt.
Die Migrationen stehen in [`server/db/migrations.ts`](server/db/migrations.ts) und werden in Reihenfolge ausgeführt; angewendete stehen in der Tabelle `schema_migrations`. Starten mehrere Instanzen gleichzeitig, migriert nur eine (Advisory Lock). Schlägt eine Migration fehl, beendet sich der Prozess.

Für Schemaänderungen eine neue Migration ans Ende der Liste anhängen (`0003_…`) – veröffentlichte Migrationen nie ändern.

## Einstellungen & Offline

Nutzereinstellungen werden immer im Browser gespeichert und mit einem SSO-Konto zusätzlich in der Datenbank (offline-first, die neuere Änderung gewinnt; offline gemachte Änderungen werden nachgereicht). API-Schlüssel (KI-Anbieter, random.org) bleiben ausschließlich im Browser.

Die App ist eine PWA: Der Service Worker legt beim ersten Besuch alles ab, was das Spiel braucht (ca. 35 MB). Ohne Verbindung wird die Anmeldung übersprungen und man spielt wie anonym – solo gegen Bots und KI, ohne Multiplayer. Kommt die Verbindung zurück, wird daraus wieder eine normale Session. Service Worker funktionieren nur über HTTPS (oder `localhost`).

## Deployment (Docker)

Beim Veröffentlichen eines GitHub-Releases baut der Workflow [`.github/workflows/docker.yml`](.github/workflows/docker.yml) das Image für `linux/amd64` und `linux/arm64` und legt es in der GitHub Container Registry ab:

```
ghcr.io/<owner>/<repo>:1.2.3   :1.2   :1   :latest   (latest nicht bei Pre-Releases)
```

Das Image enthält App und Multiplayer-Server:

```bash
# App (Standard, Port 3000)
docker run --env-file .env -p 3000:3000 ghcr.io/<owner>/<repo>
# Multiplayer-Server (Port 2567)
docker run --env-file .env -e PORT=2567 -p 2567:2567 ghcr.io/<owner>/<repo> node multiplayer/server.mjs
```

Eine vollständige Beispielumgebung mit App, Multiplayer und PostgreSQL steht in [`docker-compose.example.yml`](docker-compose.example.yml):

```bash
cp docker-compose.example.yml docker-compose.yml   # Image-Namen und Domains anpassen
docker compose up -d
```

## Lizenz & Rechtliches

Der Quellcode steht unter der [MIT-Lizenz](LICENSE). Sie gilt nur für den Code und räumt keine Rechte an Marken oder Werken Dritter ein.

Dies ist ein nicht-kommerzielles Fanprojekt. Es steht in keiner Verbindung zu Lucasfilm Ltd., The Walt Disney Company oder CATAN GmbH und wird von ihnen weder unterstützt noch gesponsert. „Star Wars“ und zugehörige Namen sind Marken von Lucasfilm Ltd. bzw. Disney, „CATAN“ ist eine Marke der CATAN GmbH.

Die Schriftarten in `public/fonts` stammen von Dritten und unterliegen deren eigenen Lizenzen.
