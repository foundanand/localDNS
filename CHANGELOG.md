# Changelog

All notable changes to dynamoip are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
dynamoip uses [semantic versioning](https://semver.org/).

---

## [1.0.5] — 2026-04-03

### Added
- **Max mode**: Cloudflare Tunnel support for public internet access — add `"tunnel": true` to config alongside `baseDomain`
- `src/tunnel.js` — tunnel lifecycle: create/reuse named tunnel, write credentials + ingress config, spawn `cloudflared` with auto-restart
- `docs/tunnel.md` — full Max mode setup guide including token creation walkthrough
- `cloudflared` auto-installed on first run: Homebrew on macOS, `sudo curl` to `/usr/local/bin` on Linux
- `TARGET_HOST` env var for Docker: controls which host the proxy forwards to (set to `host.docker.internal` on macOS/Windows)
- Docker + Max mode docs and compose examples added to `docs/docker.md`

### Changed
- "Ready:" output now labels every URL as `[PUBLIC]` (Max mode) or `[LAN]` (Pro/Quick) so exposure level is immediately visible
- Mode label in startup output now reads: `Max — Cloudflare Tunnel`, `Pro — Cloudflare + Let's Encrypt`, `Quick — mkcert`, or `HTTP`
- `startProxy` accepts `bindHost` (`127.0.0.1` in Max mode, `0.0.0.0` otherwise) and `baseDomain` as explicit params
- `src/cloudflare.js` exports `cfFetch` for reuse; adds `upsertCnameRecords` (sets `proxied: true` CNAME records for tunnel routing)
- README updated: three modes documented, Max mode setup section, architecture diagram, config reference expanded

---

## [1.0.4] — 2026-04-02

### Added
- Docker support: `LAN_IP` environment variable override allows running inside containers where auto-detected IPs are incorrect
- `docs/docker.md` with full Docker and Docker Compose setup guide
- `llms.txt` for LLM-readable project documentation
- `.env.example` with documented environment variables

---

## [1.0.3] — 2026-04-01

### Changed
- README: replaced bare `sudo dynamoip` invocations with package manager equivalents (`sudo npm exec`, `sudo npx`, `sudo pnpm exec`, `sudo yarn`) since `node_modules/.bin` is not in sudo's restricted `PATH`
- Added production setup section to README

---

## [1.0.2] — 2026-04-01

### Changed
- README: added pnpm and yarn install/run instructions alongside npm
- Local dev docs updated with pnpm and yarn equivalents

---

## [1.0.1] — 2026-04-01

### Changed
- Renamed all internal references from `localDNS`/`localdns` to `dynamoip`
- Rewrote README with clearer use-case framing

---

## [1.0.0] — 2026-04-01

### Added
- Pro mode: Cloudflare DNS + Let's Encrypt wildcard certificate via DNS-01 challenge
- Quick mode: mDNS `.local` hostnames via `dns-sd` (macOS) and `avahi` (Linux)
- HTTPS reverse proxy with Host-header routing and WebSocket support (Vite HMR, Next.js Fast Refresh)
- HTTP → HTTPS redirect on port 80
- Automatic certificate renewal with exponential backoff and hot-reload via `setSecureContext()`
- LAN IP auto-detection
- `--config`, `--port`, `--no-ssl`, `--help` CLI flags
- Concurrent ACME challenge support (handles both `*.domain` and `domain` SANs simultaneously)
- Cert cache in `~/.localmap/certs/` for instant subsequent startups
- Graceful shutdown with mDNS cleanup on Ctrl+C

### Security
- Shell commands use `spawnSync` with argument arrays — no string interpolation, no shell injection risk
- Private keys written with `0o600` permissions, cert directories with `0o700`
- Cloudflare API error responses truncated before logging to prevent credential leakage
- Cloudflare API requests have a 10-second timeout
- `.env` quote-stripping uses matched-pair logic to prevent silent token corruption

### Dependencies
- `acme-client` ^5.4.0 — ACME protocol client for Let's Encrypt
- `http-proxy` ^1.18.1 — reverse proxy with WebSocket support
- `tldts` ^7.0.27 — Public Suffix List parser for correct multi-label TLD handling
