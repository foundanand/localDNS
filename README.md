# localDNS

Expose local dev servers as real domains with trusted HTTPS — accessible from any device on your network without touching certificate settings.

```
https://inventory.yourdomain.com  →  localhost:3000
https://dashboard.yourdomain.com  →  localhost:6000
```

No "connection not secure" warnings. No cert installation on other devices. Works on every phone, tablet, and computer on your Wi-Fi.

---

## Two modes

### Pro mode — Cloudflare + Let's Encrypt (recommended)

Uses a real domain you own. localDNS sets the DNS A records in Cloudflare and obtains a Let's Encrypt certificate automatically. Every device on the network trusts it out of the box — no setup on other devices at all.

**What you need:** a domain managed by Cloudflare, a Cloudflare API token.

### Quick mode — mDNS `.local`

No domain needed. Uses mDNS to broadcast `.local` hostnames on the LAN. Other devices need to install a CA certificate once.

**What you need:** mkcert (`brew install mkcert`), sudo.

---

## Requirements

- **Node.js** >= 14
- **macOS** or **Linux**
- **sudo** for binding to ports 80 and 443

**Pro mode additionally:**
- A domain managed by Cloudflare (free tier works)
- Cloudflare API token with `Zone:DNS:Edit` permission

**Quick mode additionally:**
- mkcert — `brew install mkcert` (macOS) or [releases](https://github.com/FiloSottile/mkcert/releases)

---

## Installation

```bash
git clone https://github.com/foundanand/localDNS.git
cd localDNS
npm install

# Or install globally
npm install -g .
```

---

## Pro mode setup

**1. Create `localdns.config.json`:**

```json
{
  "baseDomain": "yourdomain.com",
  "domains": {
    "inventory": 3000,
    "dashboard": 6000
  }
}
```

`baseDomain` can be your apex domain (`yourdomain.com`) or any subdomain (`dev.yourdomain.com`). localDNS will create `inventory.yourdomain.com`, `dashboard.yourdomain.com`, etc.

**2. Create `.env`** in the same directory (never commit this):

```env
CF_API_TOKEN=your_cloudflare_api_token_here
CF_EMAIL=you@example.com
```

Get a token at **Cloudflare Dashboard → My Profile → API Tokens → Create Token**, using the **Edit zone DNS** template scoped to your domain.

**3. Run:**

```bash
sudo node bin/localdns.js
```

**First run** takes about 1 minute — localDNS sets a DNS TXT record in Cloudflare and waits for it to propagate to public resolvers before Let's Encrypt can validate it. This only happens once. After that the certificate is cached in `~/.localmap/certs/` and startup is instant.

**4. Open on any device on the same Wi-Fi:**

```
https://inventory.yourdomain.com
https://dashboard.yourdomain.com
```

No certificate prompts. No setup on other devices.

---

## Quick mode setup

**1. Create `localdns.config.json`** — no `baseDomain` field:

```json
{
  "domains": {
    "inventory": 3000,
    "dashboard": 6000
  }
}
```

**2. Run:**

```bash
sudo node bin/localdns.js
```

mkcert installs a local CA on first run (may prompt for your password), then generates a certificate covering all configured `.local` domains.

**3. Access from this machine:**

```
https://inventory.local
https://dashboard.local
```

**Trusting HTTPS on other devices** requires installing the CA certificate once per device. The startup output prints the CA cert path and per-platform instructions.

---

## Configuration reference

`localdns.config.json`:

| Field        | Type   | Required          | Description                                                     |
|--------------|--------|-------------------|-----------------------------------------------------------------|
| `domains`    | object | Yes               | Map of name → local port. e.g. `{ "api": 4000 }`               |
| `baseDomain` | string | Pro mode only     | Domain root for subdomains. e.g. `"yourdomain.com"`             |
| `port`       | number | No (default: 443) | Proxy listen port. Defaults to 443 with SSL, 80 without         |

`.env` (Pro mode):

| Variable       | Required | Description                                               |
|----------------|----------|-----------------------------------------------------------|
| `CF_API_TOKEN` | Yes      | Cloudflare API token with Zone:DNS:Edit permission        |
| `CF_EMAIL`     | No       | Email for Let's Encrypt expiry notifications              |

**Domain name rules:** letters, numbers, and hyphens only. No dots. Normalized to lowercase.

---

## CLI options

```
Usage: localdns [options]

Options:
  --config <path>   Config file path (default: ./localdns.config.json)
  --port <n>        Override proxy port
  --no-ssl          Disable HTTPS, plain HTTP only
  --help            Show this help
```

---

## How it works

### Pro mode

```
Other device
  Browser → https://inventory.yourdomain.com
      │
      │  Public DNS (Cloudflare)
      │  inventory.yourdomain.com → 192.168.x.x  (your LAN IP)
      │
      ▼
Your machine (192.168.x.x)
  ┌──────────────────────────────────────────────────────┐
  │  localDNS Proxy — HTTPS :443                         │
  │  Let's Encrypt wildcard cert for *.yourdomain.com    │
  │                                                      │
  │  inventory.yourdomain.com  →  localhost:3000         │
  │  dashboard.yourdomain.com  →  localhost:6000         │
  └──────────────────────────────────────────────────────┘
```

1. **Cloudflare DNS** — localDNS upserts A records pointing each subdomain to your current LAN IP.
2. **Let's Encrypt cert** — obtained via DNS-01 challenge. Cloudflare sets the required TXT records via API. No public port exposure needed.
3. **Concurrent challenges** — Let's Encrypt issues two challenges per wildcard order (`*.domain` and `domain`). Both TXT records coexist in Cloudflare until each is validated, then cleaned up individually.
4. **Cert cache** — stored in `~/.localmap/certs/`. Reused until 30 days before expiry, then auto-renewed in the background.
5. **Hot reload** — renewed certificates are applied with `server.setSecureContext()` — no proxy restart needed.

### Quick mode

```
Other device
  Browser → https://inventory.local
      │
      │  mDNS (link-local, same Wi-Fi only)
      │  inventory.local → 192.168.x.x
      │
      ▼
Your machine (192.168.x.x)
  ┌──────────────────────────────────────────────────────┐
  │  localDNS Proxy — HTTPS :443                         │
  │  mkcert cert for *.local                             │
  │                                                      │
  │  inventory.local  →  localhost:3000                  │
  │  dashboard.local  →  localhost:6000                  │
  └──────────────────────────────────────────────────────┘
```

1. **mDNS** — `dns-sd` (macOS) or `avahi` (Linux) broadcasts each `.local` hostname on the LAN.
2. **mkcert** — generates a cert trusted by this machine's keychain. Other devices need the CA cert installed once.

### Both modes

- Reverse proxy routes by `Host` header to the correct local port
- WebSocket upgrades forwarded transparently (Vite HMR, Next.js Fast Refresh, etc.)
- HTTP on port 80 redirects to HTTPS on port 443
- Ctrl+C cleans up all mDNS registrations before exiting

---

## Certificate lifecycle (Pro mode)

| Event | What happens |
|---|---|
| First run | DNS A records set, ACME challenge issued, cert obtained (~1 min) |
| Subsequent runs | Cert loaded from `~/.localmap/certs/` — instant startup |
| < 30 days to expiry | Background renewal triggered automatically |
| Renewal success | New cert hot-reloaded, no restart needed |
| Renewal failure | Exponential backoff: 6h → 12h → 24h → 48h (max 4 days) |
| Manual reset | Delete `~/.localmap/certs/` to force a fresh certificate |

---

## Running the examples

```bash
# Terminal 1
node examples/inventory/server.js    # port 3000

# Terminal 2
node examples/dashboard/server.js    # port 6000

# Terminal 3
sudo node bin/localdns.js
```

---

## Project structure

```
localDNS/
├── bin/
│   └── localdns.js        Entry point — argument parsing, startup orchestration
├── src/
│   ├── config.js          Config loading, validation, .env parsing
│   ├── cloudflare.js      Cloudflare API — zone lookup, A records, ACME TXT records
│   ├── acme.js            Let's Encrypt DNS-01 flow, cert cache, renewal scheduler
│   ├── certs.js           mkcert integration (quick mode fallback)
│   ├── proxy.js           HTTP/HTTPS reverse proxy, WebSocket support
│   ├── mdns.js            mDNS registration — dns-sd (macOS), avahi (Linux)
│   ├── ip.js              LAN IP detection
│   └── cleanup.js         Signal handling, child process cleanup
├── examples/
│   ├── inventory/         Example inventory app (port 3000)
│   └── dashboard/         Example dashboard app (port 6000)
├── .env.example           Environment variable template
└── localdns.config.json   Configuration
```

---

## Troubleshooting

**`CF_API_TOKEN` not found**
Add it to a `.env` file next to your config. See `.env.example` for the format.

**Cloudflare zone not found**
Verify the token has `Zone:DNS:Edit` permission and is scoped to the correct domain.

**First run shows "TXT record not confirmed in public DNS — proceeding anyway"**
This warning is harmless. It means the DNS propagation polling timed out but Let's Encrypt validated successfully anyway. If the certificate was issued, you can ignore it.

**Certificate error on first run**
Delete `~/.localmap/certs/` and retry. Verify `CF_API_TOKEN` has the correct permissions.

**Domains not resolving on other devices**
After a new A record, DNS can take up to 60 seconds to propagate. TTL is set to 60s so stale LAN IP records clear quickly.

**`EACCES` on port 443 or 80**
Run with `sudo`. Use `--port 8443` to avoid privileged ports (URLs will include the port number).

**Quick mode: `.local` not resolving on another device**
Both devices must be on the same Wi-Fi (not one on Ethernet). Check your firewall allows UDP 5353. Verify on macOS with `dns-sd -G v4 inventory.local`.

**Linux: mDNS registration fails**
`sudo apt install avahi-daemon avahi-utils && sudo systemctl start avahi-daemon`

---

## License

MIT
