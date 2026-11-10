#!/usr/bin/env bash
# Abre um túnel HTTPS temporário (Cloudflare quick tunnel, sem conta) para http://localhost:${PORT:-3000}.
# A URL https://xxxx.trycloudflare.com aparece no log; ela MUDA a cada execução. Ctrl+C encerra.
set -euo pipefail
PORT="${PORT:-3000}"
BIN="$(command -v cloudflared || echo "$HOME/.local/bin/cloudflared")"
if [ ! -x "$BIN" ]; then
  echo "Instalando cloudflared em $HOME/.local/bin ..."
  mkdir -p "$HOME/.local/bin"
  arch="$(uname -m)"; case "$arch" in x86_64) a=amd64;; aarch64|arm64) a=arm64;; *) a=amd64;; esac
  curl -fsSL -o "$HOME/.local/bin/cloudflared" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$a"
  chmod +x "$HOME/.local/bin/cloudflared"; BIN="$HOME/.local/bin/cloudflared"
fi
echo "Túnel para http://localhost:$PORT  (procure a linha com trycloudflare.com e use https://.../webhook na Meta)"
# http2 em vez de QUIC: funciona em redes que bloqueiam UDP
exec "$BIN" tunnel --no-autoupdate --protocol http2 --url "http://localhost:$PORT"
