# Quartier

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-ready-blue.svg)](Dockerfile)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

Turn any AI into a web design business.

## Who is this for?

Anyone with basic computer skills who wants to earn a living creating websites for local businesses in their community. You don't need to be a programmer. You don't need to know HTML. You just need access to a powerful AI (like Claude, Gemini, or ChatGPT) and Docker installed on your computer.

This is not a website builder like WordPress. It's simpler than that: you talk to an AI, and the AI builds professional websites for you. Your job is to find businesses that need a website, show them what you can do, and charge for it.

**This works anywhere in the world.** A person in Dakar, Bogota, or Casablanca can offer the same service to businesses in their neighborhood.

## How it works

1. **Find businesses** — The tools search Google Maps for local businesses in any neighborhood
2. **Analyze** — Automatically evaluate their current website (or if they don't have one)
3. **Download** — Scrape the entire existing site (content, images, structure)
4. **Redesign** — The AI generates a complete modern website
5. **Present** — Show the business owner a before/after comparison
6. **Get paid** — You deliver a professional website at a price that works for your market

You talk to the AI, the AI does the heavy lifting. The `PLAYBOOK.md` file tells the AI exactly what to do — how to use the scripts, what to analyze, and how to build the redesign. You bring the human side: finding clients, understanding what the local bakery actually needs, and building trust in your community.

## Requirements

- **Docker** — that's it. Everything runs inside a container.
- **Google Places API key** ([get one here](https://console.cloud.google.com/apis/credentials)) — enable "Places API (New)"
- **An AI assistant** with terminal access (Claude Code, or any AI that can run shell commands)

## Setup

```bash
# Clone the repo — this becomes your workspace
git clone https://github.com/EnriqueLop/quartier.git my-business
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

## What a session looks like

You open your AI assistant in this directory and have a conversation:

> **You:** "Search for businesses in Kreuzberg, Berlin"
>
> **AI:** *searches Google Maps, finds 40 businesses, evaluates their websites, presents candidates*
>
> **You:** "Redesign the website for that bakery"
>
> **AI:** *downloads the site, analyzes branding, gets Google reviews, generates a modern website*
>
> **You:** "Looks good, show me"

You open the result in your browser. If you like it, you show it to the bakery owner.

Under the hood, the AI runs scripts via Docker — you don't need to know how they work. The `PLAYBOOK.md` file teaches the AI the whole process.

## Project structure

```
.env                         ← your API key (not committed)
config.operator.json         ← your name/email/website (not committed)
PLAYBOOK.md                  ← instructions for the AI
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
- The `PLAYBOOK.md` is in English. The AI can work in any language — just talk to it in yours.

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
