# dynamoip — Claude Code Guidelines

## Pre-commit checklist

Run through this before every commit. Nothing ships without all boxes ticked.

### Code
- [ ] `package.json` version matches the release (bump before committing)
- [ ] `CHANGELOG.md` has an entry for this version with accurate Added/Changed/Fixed sections
- [ ] No `console.log` debug lines left in source

### Docs — must stay in sync with every feature change
- [ ] `README.md` — modes section, config reference, requirements, startup output examples, troubleshooting
- [ ] `llms.txt` — mirrors README but in LLM-friendly prose; three modes, env vars, project layout, docs list
- [ ] `docs/tunnel.md` — if Max mode behaviour changed (tunnel flow, token setup, credential storage)
- [ ] `docs/docker.md` — if Docker behaviour changed (new env vars, compose examples, summary table)
- [ ] `--help` text in `bin/dynamoip.js` — if a new mode, flag, or env var was added

### Config surface
- [ ] New config fields validated in `src/config.js` with a clear error message
- [ ] New env vars documented in README config reference table and `llms.txt`
- [ ] `.env.example` updated if a new env var is required or optional

### Git
- [ ] Commit message summarises *why*, not just what changed
- [ ] Tag created (`v1.x.x`) and pushed alongside the commit when publishing to npm

---

## Modes at a glance

| Mode  | Trigger                        | sudo? | Exposes  |
|-------|--------------------------------|-------|----------|
| Max   | `baseDomain` + `"tunnel":true` | No    | Internet |
| Pro   | `baseDomain` only              | Yes   | LAN only |
| Quick | no `baseDomain`                | Yes   | LAN only |
| HTTP  | `--no-ssl`                     | No    | LAN only |

## Key file locations

- Entry point: `bin/dynamoip.js`
- Mode selection: `bin/dynamoip.js` — `useTunnel`, `effectiveAcme`, `useMkcert`
- Config parsing + validation: `src/config.js`
- Cloudflare API (A + CNAME records, ACME TXT): `src/cloudflare.js`
- Tunnel lifecycle (create, credentials, cloudflared): `src/tunnel.js`
- Proxy (host-header routing, WebSocket, bindHost, TARGET_HOST): `src/proxy.js`
- Cert cache: `~/.localmap/certs/` — Pro mode
- Tunnel credentials: `~/.localmap/tunnels/` — Max mode
