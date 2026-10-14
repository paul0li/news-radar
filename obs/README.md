# obs

Control OBS from a terminal over [obs-websocket](https://github.com/obsproject/obs-websocket) v5
(built into OBS ≥ 28). Single file, no dependencies, Node ≥ 22.

## Setup

1. In OBS: *Tools → WebSocket Server Settings* → enable it, keep port `4455`, enable authentication.
2. Create `~/.config/obs-remote/env` (keep it out of the repo, `chmod 600`):
   ```
   OBS_HOST=my-obs-pc      # hostname or IP (e.g. a Tailscale name)
   OBS_PORT=4455
   OBS_PASSWORD=...
   OBS_BANNER=Titulares    # source name of the headline ticker
   ```
3. Optionally put it on your `PATH`: `ln -s "$PWD/obs/obs.js" ~/.local/bin/obs`

## Usage

```bash
obs ping                     # connectivity check (no password needed)
obs estado                   # streaming / recording status and current scene
obs escenas                  # list scenes
obs escena "Cámara"          # switch the program scene
obs fuentes                  # sources in the current scene
obs mostrar "Fuente"         # show a source / obs ocultar "Fuente"
obs banner on|off            # show or hide the headline ticker source
obs grabar iniciar|detener
obs transmision iniciar
obs transmision detener --si # requires --si to avoid accidents
```

Commands are in Spanish because the tool was built for a Chilean stream. The WebSocket server is
idle unless a command arrives, so it doesn't affect a running stream.
