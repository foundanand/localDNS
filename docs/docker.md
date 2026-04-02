# Running dynamoip in Docker

This guide explains how to run dynamoip inside a Docker container, including the extra step required on macOS and Windows.

---

## Why Docker needs special handling on macOS and Windows

When dynamoip starts, it detects your machine's LAN IP to register DNS records and start the proxy. On a bare machine this works automatically — `os.networkInterfaces()` returns the real network interfaces.

Inside a Docker container the situation changes by platform:

**Linux** — Docker supports `--network: host`, which makes the container share the host's network stack. `os.networkInterfaces()` sees the real interfaces and auto-detection works with no extra config.

**macOS and Windows** — `--network: host` is not supported (Docker Desktop runs containers inside a Linux VM). The container only sees virtual interfaces (e.g. `172.17.0.2`), not the host's actual LAN IP. Auto-detection returns the wrong address.

`host.docker.internal` does not solve this either — it resolves to the Docker Desktop VM's bridge IP (e.g. `192.168.65.2`), not the LAN IP your router assigned to your machine.

The solution is to pass the LAN IP explicitly via the `LAN_IP` environment variable.

---

## The `LAN_IP` environment variable

When `LAN_IP` is set, dynamoip uses it directly and skips auto-detection. When it is unset, auto-detection runs as normal (correct on Linux; incorrect inside Docker on macOS/Windows).

```env
LAN_IP=192.168.1.42
```

---

## docker-compose setup

Pass `LAN_IP` through to the dynamoip service using the `${LAN_IP:-}` syntax. This means: use the value if set in the host environment, otherwise pass nothing (so auto-detection runs on Linux where `LAN_IP` is left unset).

```yaml
services:
  dynamoip:
    image: your-dynamoip-image
    network_mode: host          # Linux only — remove on macOS/Windows
    environment:
      LAN_IP: ${LAN_IP:-}
      CF_API_TOKEN: ${CF_API_TOKEN}
      CF_EMAIL: ${CF_EMAIL:-}
    volumes:
      - ./dynamoip.config.json:/app/dynamoip.config.json:ro
      - dynamoip-certs:/root/.localmap/certs

volumes:
  dynamoip-certs:
```

> On macOS and Windows, remove `network_mode: host` — it is not supported and will cause an error.

---

## Finding your LAN IP

You need to find the IP your router assigned to your machine, then set it as `LAN_IP` before starting Docker.

**macOS:**
```bash
ipconfig getifaddr en0         # Wi-Fi
ipconfig getifaddr en1         # Ethernet (if applicable)
```

Or, to detect it automatically from the default route:
```bash
route -n get default | awk '/interface:/{print $2}' | xargs ipconfig getifaddr
```

**Linux:**
```bash
ip route get 1 | awk '{print $7; exit}'
```

**Windows (PowerShell):**
```powershell
(Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric |
    Select-Object -First 1 | Get-NetIPAddress -AddressFamily IPv4).IPAddress
```

---

## Recommended: auto-detect with a startup script

Instead of manually setting `LAN_IP` every time, use a startup script that detects it from the host and injects it before calling `docker compose up`. This way, if your IP changes (DHCP reassignment, switching networks), you just re-run the script and everything picks up the new address automatically.

**macOS/Linux (`start.sh`):**
```bash
#!/bin/bash
IFACE=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
export LAN_IP=$(ipconfig getifaddr "$IFACE" 2>/dev/null)

# Linux fallback
if [ -z "$LAN_IP" ]; then
  export LAN_IP=$(ip route get 1 2>/dev/null | awk '{print $7; exit}')
fi

echo "LAN_IP=$LAN_IP"
docker compose up "$@"
```

**Windows (`start.ps1`):**
```powershell
$env:LAN_IP = (Get-NetRoute -DestinationPrefix '0.0.0.0/0' |
    Sort-Object RouteMetric | Select-Object -First 1 |
    Get-NetIPAddress -AddressFamily IPv4).IPAddress

Write-Host "LAN_IP=$($env:LAN_IP)"
docker compose up
```

Run `./start.sh` (or `.\start.ps1`) instead of `docker compose up` directly.

---

## Linux: no extra config needed

On Linux, use `--network: host` in your docker-compose and leave `LAN_IP` unset. dynamoip will auto-detect the LAN IP inside the container just as it does when running bare on the host.

```yaml
services:
  dynamoip:
    network_mode: host
    environment:
      CF_API_TOKEN: ${CF_API_TOKEN}
```

---

## Summary

| Platform | `network_mode` | `LAN_IP` needed? |
|---|---|---|
| Linux | `host` | No — auto-detected |
| macOS | *(omit)* | Yes |
| Windows | *(omit)* | Yes |
