#!/usr/bin/env bash
# Auto-deploy de la pauta en Hermes: cron cada minuto. Si origin/main cambió desde el último
# deploy exitoso, deja el checkout igual a origin/main, actualiza la unidad systemd si cambió,
# reinicia el servicio y verifica /healthz.
#
# Instalar (crontab -e como ubuntu):
#   * * * * * /home/ubuntu/news-radar/pauta/deploy/autodeploy.sh >> /home/ubuntu/news-radar-deploy.log 2>&1
#
# · Estado fuera de la repo: ~/.news-radar-deployed (último commit desplegado; solo se escribe si el
#   deploy funcionó, así un deploy fallido se reintenta al minuto siguiente).
# · Pausa: touch ~/.news-radar-autodeploy-paused (sale sin hacer nada mientras exista).
set -euo pipefail

# Todo el cuerpo es una función llamada en la última línea: `git reset` puede reescribir este archivo.
main() {
  export PATH=/home/ubuntu/.local/bin:/usr/local/bin:/usr/bin:/bin
  local repo=/home/ubuntu/news-radar branch=main unit=pauta.service
  local stamp=$HOME/.news-radar-deployed pause=$HOME/.news-radar-autodeploy-paused
  [ -e "$pause" ] && exit 0

  exec 9>/tmp/news-radar-autodeploy.lock
  flock -n 9 || exit 0

  cd "$repo"
  git fetch -q origin "$branch"
  local remote
  remote=$(git rev-parse "origin/$branch")
  [ "$remote" = "$(cat "$stamp" 2>/dev/null)" ] && exit 0

  echo "== $(date -u +%FT%TZ) deploying $remote"
  git reset -q --hard "origin/$branch"
  node --check pauta/server.js

  if ! cmp -s pauta/deploy/pauta.service /etc/systemd/system/$unit; then
    sudo cp pauta/deploy/pauta.service /etc/systemd/system/$unit
    sudo systemctl daemon-reload
    echo "   unidad systemd actualizada"
  fi
  sudo systemctl restart "$unit"

  local port
  port=$(grep -E '^PORT=' ~/.config/pauta/pauta.env | cut -d= -f2)
  for _ in $(seq 1 15); do
    if curl -fs "http://127.0.0.1:${port:-3010}/healthz" >/dev/null; then
      git rev-parse HEAD > "$stamp"
      echo "== $(date -u +%FT%TZ) deployed $(git log --oneline -1)"
      return 0
    fi
    sleep 1
  done
  echo "!! healthz no respondió tras el deploy de $remote" >&2
  exit 1
}
main "$@"; exit
