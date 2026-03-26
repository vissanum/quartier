# Quartier

AI-powered toolkit for finding local businesses that need a website redesign — and building it for them.

## What is this?

A complete toolkit + business model for offering affordable web redesign services to small local businesses. The kind that still have a website from 2008 or no website at all.

This is not a website builder. It's a full workflow powered by AI:

1. **Prospect** — Search Google Maps for local businesses in any neighborhood
2. **Analyze** — Automatically evaluate their current website (or lack thereof)
3. **Scrape** — Download the entire existing site (content, images, structure)
4. **Redesign** — The AI generates a complete modern website
5. **Present** — Show the client a before/after comparison
6. **Deploy** — Put the new site live

**You talk to the AI, the AI does the work.** The `CLAUDE.md` file is the playbook — it tells the AI how to use the scripts, what to analyze, and how to build the redesign. You bring the human touch: knocking on doors, understanding what the local bakery actually needs, and pricing it right for your market.

**This works anywhere in the world.** A developer in Lagos, Lima, or Lahore can run the exact same process for businesses in their area.

## Requirements

- **Docker** — that's it. Everything runs inside a container.
- **Google Places API key** ([get one here](https://console.cloud.google.com/apis/credentials)) — enable "Places API (New)"
- **An AI assistant** with terminal access (Claude Code, or any AI that can run shell commands)

## Setup

```bash
# Clone the repo — this becomes your workspace
git clone https://github.com/enriquee/quartier.git my-business
cd my-business

# Configure your API key
cp .env.example .env
# Edit .env and add your GOOGLE_PLACES_API_KEY

# Configure your info (appears in reports and footers)
cp config.operator.example.json config.operator.json
# Edit config.operator.json with your name, email, website

# Open your AI assistant and start talking
# "Search for businesses in Kreuzberg, Berlin"
```

No `npm install` needed. The first time you run `./run.sh`, Docker builds the image locally.

## How it works

You open Claude Code (or any AI with terminal access) in this directory. The AI reads `CLAUDE.md` and knows how to:

- Search for businesses: `./run.sh node prospect/search.js "Kreuzberg, Berlin"`
- Analyze their websites: `./run.sh node prospect/fetch.js https://example.com --screenshot`
- Scrape entire sites: `./run.sh node scraper/scrape-site.js https://example.com my-project`
- Get Google reviews: `./run.sh node scraper/google-places.js "Business Name" "City" my-project`
- Optimize images: `./run.sh ./tools/optimize-images.sh projects/my-project/redesign/assets`
- Validate HTML: `./run.sh bash tools/validate-html.sh projects/my-project/redesign`

All commands run inside Docker via `./run.sh`. You don't need Node.js installed.

### The AI does the heavy lifting

You say "redesign this website" and the AI:
1. Scrapes the original site (all pages, images, content)
2. Analyzes the business (branding, colors, services, contact info)
3. Downloads Google reviews and photos
4. Generates a complete modern responsive website
5. Creates a before/after showcase to present to the client

You review the result locally by opening `projects/<name>/redesign/index.html` in your browser.

## Project structure

```
.env                         ← your API key (not committed)
config.operator.json         ← your name/email/website (not committed)
CLAUDE.md                    ← the AI playbook
run.sh                       ← Docker wrapper for all scripts

projects/<name>/
  config.json                ← business data (colors, contact, services)
  original/                  ← scraped website
    sitemap.json             ← full sitemap with content
    pages/                   ← subpage HTML files
    assets/                  ← all images
  redesign/                  ← new website
    index.html
    *.html                   ← subpages
    assets/
  showcase.html              ← before/after for the client

prospects/
  config.json                ← business types to search for
  prospects.json             ← search results (generated)

templates/                   ← legal page templates (Spanish law)
```

## Adapting to your country

- The legal templates (`templates/`) are for **Spanish law** (LSSI-CE, RGPD). Adapt them to your local regulations.
- The business types in `prospects/config.json` are in Spanish. Edit them for your area.
- The `CLAUDE.md` playbook is in Spanish. You can translate it or ask the AI to work in your language.

## API costs

- **Google Places API**: 5,000 free requests/month. A typical neighborhood search uses ~40 requests.
- **AI assistant**: depends on your provider (Claude Pro ~$20/month, free tiers available)
- **Docker**: free (local)

## Tips for the business

- **Start in your neighborhood.** You know the businesses, they know you.
- **Show, don't tell.** The before/after showcase is your best sales tool.
- **Price for your market.** A redesign that costs you 2 hours of work can be worth a lot to a business owner who has been meaning to update their website for years.
- **Keep it simple.** These are static HTML sites. No CMS, no maintenance headaches.
- **Use real photos.** Google Maps photos of the actual business beat AI-generated images every time.

## Updating

When quartier gets updates, pull them without losing your work:

```bash
git remote rename origin quartier   # first time only
git remote add origin <your-repo>   # your private repo for client data
git pull quartier main              # get updates
```

## Created by

[Enrique López](https://enriquelopez.eu) — freelancer in Burgos and Bilbao, Spain. Built this to offer affordable redesigns to local businesses, then open-sourced it so anyone can do the same.

## Acknowledgments

[Elkartenet](https://elkartenet.eus) — helping bring this technology where it's needed.

## License

MIT — do whatever you want with it.
