# news-radar

A news radar for politics: scrape multiple sources, cross-reference them, pick and classify the most
relevant stories, and label them as checked, unchecked or likely fake.

## Modules

- [`pauta/`](pauta/) **Pauta editorial**: paste the day's links and Claude orders them for a live
  stream, alternating funny and serious stories to keep the audience watching.
- Repository root and `pendiente/`: scraping experiments against Chilean news outlets
  (`.http` requests and `test_biobio.py`).

## License

[MIT](LICENSE)
