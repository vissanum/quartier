# Contributing to Quartier

Thanks for your interest in improving Quartier! Here's how you can help.

## Ways to contribute

- **Report bugs** — Something broken? Open an issue with the bug template.
- **Suggest features** — Ideas for new tools, better workflows, or new integrations? Open an issue.
- **Improve scripts** — Better scraping, smarter analysis, faster optimization.
- **Add templates** — Legal templates for other countries, new business types in `prospects/config.json`.
- **Translate** — The `PLAYBOOK.md` is in English, but more languages would help.
- **Improve docs** — Clearer setup instructions, tutorials, screenshots.

## Getting started

```bash
git clone https://github.com/EnriqueLop/quartier.git
cd quartier

cp .env.example .env
# Add your GOOGLE_PLACES_API_KEY

cp config.operator.example.json config.operator.json
# Add your info

# Test that Docker works
./run.sh node -e "console.log('Ready')"
```

## Making changes

1. Fork the repo
2. Create a branch (`git checkout -b my-feature`)
3. Make your changes
4. Test them with `./run.sh`
5. Open a pull request

## Project structure

```
lib/          ← shared config (load-env.js)
scraper/      ← download websites and Google data
prospect/     ← find and evaluate businesses
generate/     ← create redesigns, reports, pipeline
tools/        ← image optimization, HTML validation
templates/    ← legal page templates
docker/       ← Dockerfiles
```

Each folder is independent — you can improve the scraper without touching the generator.

## Guidelines

- Keep it simple. This tool is for people who are not developers.
- Test with `./run.sh` (everything runs in Docker).
- Don't add dependencies unless really necessary.
- Write in English for code and docs.

## Questions?

Open an issue. There are no stupid questions.
