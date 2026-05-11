# DonorPress Documentation

This folder contains the **DonorPress public documentation site** (Mintlify) and an **automated screenshot capture script** (Playwright).

> ⚠️ This folder is completely outside the plugin code at `wp-content/plugins/donorpress/`. Nothing here is shipped with the plugin — it's just the docs source.

## Folder layout

```
docs/
├── docs.json              ← Mintlify config (theme, nav, branding)
├── introduction.mdx       ← Landing page
├── getting-started/       ← Install, quick-start, setup wizard
├── core-concepts/
├── forms/
├── donations/
├── donors/
├── subscriptions/
├── campaigns/
├── gateways/
├── modules/               ← One page per premium module
├── emails/
├── reports/
├── shortcodes/            ← Every shortcode + every attribute
├── settings/              ← Every option in every settings panel
├── faq/
├── developers/            ← Architecture, REST API, hooks
├── rest-api/
├── hooks/
├── images/
│   ├── admin/             ← Auto-captured admin screenshots
│   ├── frontend/          ← Auto-captured frontend screenshots
│   ├── logo-light.svg
│   └── logo-dark.svg
├── scripts/
│   └── screenshots.mjs    ← Playwright capture script
├── package.json
├── .env.example
└── README.md              ← (this file)
```

## Prerequisites

- **Node.js 18+**
- A local WordPress install with DonorPress active (Laragon's default site URL works)
- Test admin credentials and (optionally) a test donor account with at least one donation

## Setup

```bash
cd docs
npm install
npm run screenshots:install   # one-time: downloads Chromium for Playwright
cp .env.example .env          # then edit .env with your credentials
```

## Day-to-day workflow

### Preview the docs locally

```bash
npm run dev
```

Mintlify spins up a hot-reloading preview at `http://localhost:3000`. Edit any `.mdx` file and the page updates instantly.

### Regenerate screenshots after a UI change

```bash
npm run screenshots
```

This logs into your local WordPress, walks every DonorPress admin page (and the configured frontend pages), and overwrites the PNGs in `images/admin/` and `images/frontend/`. The MDX files reference these paths, so the docs immediately pick up the new captures.

### Check for broken links

```bash
npm run check
```

## Configuring `.env`

| Variable | Purpose | Example |
| --- | --- | --- |
| `WP_BASE_URL` | URL of your local WordPress install. No trailing slash. | `http://donorpress.test` |
| `WP_ADMIN_USER` / `WP_ADMIN_PASS` | Admin credentials for capturing admin screenshots. | `admin` / `password` |
| `WP_DONOR_USER` / `WP_DONOR_PASS` | Optional. A test donor account used for logged-in frontend captures. Leave blank to skip. | — |
| `DONATION_FORM_SLUG` | Optional. Slug of a published page containing `[donorpress_form id="…"]`. | `donate` |
| `DONOR_DASHBOARD_SLUG` | Optional. Slug of a published page containing `[donorpress_dashboard]`. | `my-donations` |

**Never commit `.env`.** It's already in `.gitignore`.

## Adding a new admin page to the screenshot run

Open `scripts/screenshots.mjs` and add an entry to the `ADMIN_PAGES` array:

```js
{ slug: 'my-new-page', path: '/wp-admin/admin.php?page=donorpress-settings#/my-new-section' },
```

The next `npm run screenshots` will capture it as `images/admin/my-new-page.png`.

## Adding a new MDX page

1. Create the `.mdx` file under the appropriate folder (e.g. `forms/my-new-feature.mdx`).
2. Reference the file in `docs.json` under the matching `pages` array.
3. Use Mintlify components (`<Frame>`, `<CardGroup>`, `<Steps>`, `<AccordionGroup>`, `<Tip>`, etc.) for consistent styling.

## Safety notes for the screenshot script

- **Read-only.** It only navigates and screenshots. No clicks on destructive buttons, no form submissions, no record edits.
- **Local only.** Don't point it at a production site — the credentials would be transmitted over HTTPS but the rest of the workflow assumes a throw-away test environment.
- **Chromium runs headless** by default. If you want to watch it, change `headless: true` → `headless: false` in `screenshots.mjs`.
- **Login failures abort loudly** rather than running unauthenticated.

## Deploying

Mintlify auto-deploys when you push the `docs/` folder to GitHub and connect the repo at [dashboard.mintlify.com](https://dashboard.mintlify.com).

For self-hosting, run `mintlify build` and serve the resulting static files from any CDN.
