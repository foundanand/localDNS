# Using localDNS in local development (without publishing to npm)

`npm link` creates a symlink from your global `node_modules` to this local repository. Any changes you make here are reflected immediately in linked apps — no reinstall or publish needed.

> **npm 7+ users:** `npm link` can hang on projects with complex dependencies (Prisma, Sharp, etc.). Use the [file: protocol method](#alternative-file-protocol) instead — it is more reliable.

---

## 1. Register the package globally

Run this once from the localDNS repository root:

```bash
cd /path/to/localDNS
npm link
```

This reads the `name` field from `package.json` (`localdns`) and creates a global symlink pointing to this directory.

---

## 2. Link it into your app

Run this from the root of the app you want to test with:

```bash
cd /path/to/your/app
npm link localdns
```

This creates `node_modules/localdns` in your app as a symlink to the localDNS source. Repeat for every app you want to link — the global registration from Step 1 covers all of them.

---

## 3. Add a config file to your app

`localdns.config.json` is **not part of the localDNS package** — each project that uses localDNS has its own config. The localDNS repo ships a `localdns.config.example.json` showing the format, but the actual config file belongs in your project.

Create `localdns.config.json` at the root of your app:

```json
{
  "baseDomain": "yourdomain.com",
  "domains": {
    "myapp": 3000
  }
}
```

For Quick mode (no domain needed), omit `baseDomain`:

```json
{
  "domains": {
    "myapp": 3000
  }
}
```

Add it to your app's `.gitignore` if it contains a real domain or sensitive values you don't want committed:

```gitignore
localdns.config.json
```

Or commit it if your team shares the same domain setup — it contains no secrets (credentials go in `.env`, not the config).

See the [configuration reference](../README.md#configuration-reference) for all options.

---

## 4. Add scripts to package.json

```json
"scripts": {
  "dev": "next dev",
  "dev:proxy": "sudo localdns --config localdns.config.json",
  "dev:full": "concurrently \"npm run dev\" \"sudo npm run dev:proxy\""
}
```

If you use `dev:full`, install `concurrently` first:

```bash
npm install --save-dev concurrently
```

Then run:

```bash
npm run dev:full
```

Or in two separate terminals:

```bash
# Terminal 1
npm run dev

# Terminal 2
npm run dev:proxy
```

---

## 5. Add .env for Pro mode

If you are using Pro mode (Cloudflare + Let's Encrypt), create a `.env` file next to `localdns.config.json`:

```env
CF_API_TOKEN=your_cloudflare_api_token_here
CF_EMAIL=you@example.com
```

Make sure `.env` is in your app's `.gitignore`:

```gitignore
.env
.env.*
!.env.example
```

---

## Unlinking

To remove the link from a specific app:

```bash
cd /path/to/your/app
npm unlink localdns
```

To remove the global registration entirely:

```bash
cd /path/to/localDNS
npm unlink
```

---

## Linking to multiple apps

Run Step 2 in each app separately. The global symlink from Step 1 only needs to be created once.

```bash
npm link localdns   # in app-one
npm link localdns   # in app-two
npm link localdns   # in app-three
```

All three will point to the same localDNS source directory.

---

## Verifying the link

```bash
# Confirm the symlink exists in your app
ls -la node_modules/localdns

# Confirm it resolves to your local source
node -e "console.log(require.resolve('localdns'))"

# Check the global link
npm ls -g --depth=0 localdns
```

---

## Alternative: file: protocol

If `npm link` hangs (common on npm 7+ with projects that have heavy native dependencies like Prisma or Sharp), use the `file:` protocol instead.

Add localDNS directly to your app's `package.json`:

```bash
npm install --save-dev file:/path/to/localDNS --legacy-peer-deps
```

Or edit `package.json` manually and run `npm install --legacy-peer-deps`:

```json
"devDependencies": {
  "localdns": "file:/Users/you/path/to/localDNS"
}
```

`node_modules/localdns` will point to your local source directory — code changes are reflected immediately, same as `npm link`.

**One difference:** if you add a new dependency to localDNS (e.g. `npm install something` inside the localDNS repo), re-run `npm install` in your app to pick it up.

To remove it later:

```bash
npm uninstall localdns
```

---

## Notes

- `npm link` uses the `name` in `package.json` — if you rename the package, re-run `npm link` in the localDNS directory and `npm link <new-name>` in each app.
- Linked packages are not affected by `npm install` in your app — the symlink persists.
- If you run `npm install` in the localDNS directory itself (e.g. to add a dependency), the link stays intact and the new dependency is available immediately in all linked apps.
- To publish to npm later, run `npm publish` from the localDNS directory. Linked apps can then switch to the published version with `npm unlink localdns && npm install localdns`.
