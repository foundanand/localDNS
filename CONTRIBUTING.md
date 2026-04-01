# Contributing to localDNS

Thanks for taking the time to contribute. This document explains how to report bugs, suggest features, and submit code changes.

---

## Reporting bugs

[Open an issue](https://github.com/foundanand/localDNS/issues) and include:

- Your OS and version (e.g. macOS 14.4, Ubuntu 22.04)
- Node.js version (`node --version`)
- Which mode you are using (Pro / Quick)
- The full terminal output, including any error messages
- Your `localdns.config.json` (redact any real domain names if you prefer)

Do **not** include your `CF_API_TOKEN` or any credentials in the issue.

---

## Suggesting features

[Open an issue](https://github.com/foundanand/localDNS/issues) with the label `enhancement`. Describe:

- What problem you are trying to solve
- What you expected localDNS to do
- Any alternatives you considered

---

## Submitting a pull request

1. **Fork** the repository and create a branch from `main`:

   ```bash
   git checkout -b fix/my-bug-fix
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Make your changes.** Keep commits focused — one logical change per commit.

4. **Test manually** before opening a PR:

   ```bash
   # Run the examples
   node examples/inventory/server.js &
   node examples/dashboard/server.js &
   sudo node bin/localdns.js
   ```

   For Pro mode changes, test with a real Cloudflare domain. For Quick mode changes, test with mkcert installed.

5. **Open a pull request** against `main`. In the PR description:
   - Explain what the change does and why
   - Note any manual testing you did
   - Call out anything you are unsure about

---

## Code style

- CommonJS modules (`require`/`module.exports`) — no ESM
- No build step, no transpilation
- 2-space indentation
- Keep functions small and focused
- Avoid adding dependencies unless necessary — fewer deps = faster install and smaller attack surface
- Never use `execSync` or `spawnSync` with string interpolation for shell commands — always pass arguments as an array to avoid injection

---

## Project layout

```
bin/localdns.js     Entry point and startup orchestration
src/config.js       Config + .env loading
src/cloudflare.js   Cloudflare API client
src/acme.js         Let's Encrypt DNS-01 cert issuance and renewal
src/certs.js        mkcert integration (Quick mode)
src/proxy.js        HTTP/HTTPS reverse proxy + WebSocket support
src/mdns.js         mDNS registration (dns-sd / avahi)
src/ip.js           LAN IP detection
src/cleanup.js      Signal handling and child process cleanup
```

The startup flow in `bin/localdns.js` is the best place to start understanding how the pieces connect.

---

## Security issues

Please do **not** open a public issue for security vulnerabilities. Instead, email the maintainer directly (see the GitHub profile). We will respond within 72 hours.
