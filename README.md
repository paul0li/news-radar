# news-radar

A news radar for politics: scrape multiple sources, cross-reference them, pick and classify the most
relevant stories, and label them as checked, unchecked or likely fake.

## Modules

- [`pauta/`](pauta/) **Pauta editorial**: paste the day's links and Claude orders them for a live
  stream, alternating funny and serious stories to keep the audience watching.
- [`obs/`](obs/): a tiny zero-dependency CLI to control OBS remotely over obs-websocket v5
  (scenes, sources, the headline banner, recording, streaming).
- Repository root and `pendiente/`: scraping experiments against Chilean news outlets
  (`.http` requests and `test_biobio.py`).

## License

[MIT](LICENSE)
