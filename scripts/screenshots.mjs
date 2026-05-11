#!/usr/bin/env node
/*
 * DonorPress Documentation — Automated Screenshot Capture
 *
 * Walks the WordPress admin (and a few frontend pages) and saves PNGs into
 * docs/images/. Run this whenever the UI changes to regenerate the doc shots
 * in one go.
 *
 * USAGE:
 *   1. Copy .env.example → .env and fill in credentials for your local WP.
 *   2. npm install
 *   3. npm run screenshots:install   (one-time: downloads Chromium)
 *   4. npm run screenshots
 *
 * SAFETY NOTES:
 *   • Read-only — this script only navigates and screenshots. It never clicks
 *     destructive buttons, never submits forms, never edits records.
 *   • Designed for LOCAL test sites. Do not point it at production.
 *   • The script aborts loudly if login fails rather than running unauthenticated.
 */

import { chromium } from '@playwright/test';
import { config as dotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

dotenv();

const __dirname  = dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT  = resolve(__dirname, '..');
const IMG_ROOT   = join(DOCS_ROOT, 'images');

const BASE       = (process.env.WP_BASE_URL || 'http://donorpress.test').replace(/\/$/, '');
const ADMIN_USER = process.env.WP_ADMIN_USER || '';
const ADMIN_PASS = process.env.WP_ADMIN_PASS || '';
const DONOR_USER = process.env.WP_DONOR_USER || '';
const DONOR_PASS = process.env.WP_DONOR_PASS || '';
const FORM_SLUG  = process.env.DONATION_FORM_SLUG || '';
const DASH_SLUG  = process.env.DONOR_DASHBOARD_SLUG || '';

const VIEWPORT   = { width: 1440, height: 900 };

/* ---------------------------------------------------------------------------
 * Page registry — extend this list as you add new admin screens.
 * Each entry produces ONE screenshot file at images/<dir>/<slug>.png.
 *
 * `wait` lets us pause briefly for SPA navigation / charts to render.
 * `clip` (optional) restricts the capture to a region.
 * ------------------------------------------------------------------------ */
const ADMIN_PAGES = [
	{ slug: 'dashboard',                path: '/wp-admin/admin.php?page=donorpress' },
	{ slug: 'campaigns',                path: '/wp-admin/admin.php?page=donorpress-campaigns' },
	{ slug: 'donations-list',           path: '/wp-admin/admin.php?page=donorpress-donations' },
	{ slug: 'donors-list',              path: '/wp-admin/admin.php?page=donorpress-donors' },
	{ slug: 'subscriptions-list',       path: '/wp-admin/admin.php?page=donorpress-subscriptions' },
	{ slug: 'forms-list',               path: '/wp-admin/admin.php?page=donorpress-forms' },
	{ slug: 'form-builder',             path: '/wp-admin/admin.php?page=donorpress-forms#/forms/new' },
	{ slug: 'reports',                  path: '/wp-admin/admin.php?page=donorpress-reports' },
	{ slug: 'emails-list',              path: '/wp-admin/admin.php?page=donorpress-emails' },
	{ slug: 'tools',                    path: '/wp-admin/admin.php?page=donorpress-tools' },
	{ slug: 'settings-general',         path: '/wp-admin/admin.php?page=donorpress-settings' },
	{ slug: 'settings-gateways',        path: '/wp-admin/admin.php?page=donorpress-settings#/payment-gateways' },
	{ slug: 'settings-emails',          path: '/wp-admin/admin.php?page=donorpress-settings#/emails' },
	{ slug: 'modules-list',             path: '/wp-admin/admin.php?page=donorpress-addons' },
	{ slug: 'annual-receipts-settings', path: '/wp-admin/admin.php?page=donorpress-settings#/annual-receipts' },
	{ slug: 'welcome-celebration',      path: '/wp-admin/admin.php?page=donorpress-setup' },
	{ slug: 'plugin-activated',         path: '/wp-admin/plugins.php?s=donorpress' },
];

const FRONTEND_PAGES = [
	FORM_SLUG && { slug: 'donation-form',                path: `/${FORM_SLUG}/`,  authAs: 'guest' },
	DASH_SLUG && { slug: 'donor-dashboard',              path: `/${DASH_SLUG}/`,  authAs: 'donor' },
	DASH_SLUG && { slug: 'dashboard-annual-receipts-tab',path: `/${DASH_SLUG}/#dp-annual-receipts`, authAs: 'donor' },
].filter(Boolean);

/* ---------------------------------------------------------------------- */

async function ensureDir(p) {
	await mkdir(p, { recursive: true });
}

async function login(page, username, password, label) {
	if (!username || !password) {
		throw new Error(`Missing credentials for ${label}. Set them in .env first.`);
	}

	await page.goto(`${BASE}/wp-login.php`, { waitUntil: 'domcontentloaded' });
	await page.fill('#user_login', username);
	await page.fill('#user_pass',  password);
	await Promise.all([
		page.waitForLoadState('networkidle'),
		page.click('#wp-submit'),
	]);

	// Verify login succeeded by checking for the admin bar OR a redirect away from wp-login.
	const stillOnLogin = page.url().includes('wp-login.php');
	if (stillOnLogin) {
		throw new Error(
			`Login failed for ${label} (${username}). Double-check credentials in .env and that the site is reachable at ${BASE}.`
		);
	}
}

async function captureAdminPages(browser) {
	const context = await browser.newContext({ viewport: VIEWPORT });
	const page    = await context.newPage();

	console.log(`\n🔐 Logging in as admin (${ADMIN_USER}) at ${BASE}…`);
	await login(page, ADMIN_USER, ADMIN_PASS, 'admin');

	const outDir = join(IMG_ROOT, 'admin');
	await ensureDir(outDir);

	for (const { slug, path } of ADMIN_PAGES) {
		const url = BASE + path;
		try {
			console.log(`📸 admin/${slug}  ←  ${url}`);
			await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
			// Give the React SPA + any charts a moment to settle.
			await page.waitForTimeout(800);
			await page.screenshot({
				path: join(outDir, `${slug}.png`),
				fullPage: true,
			});
		} catch (err) {
			console.warn(`   ⚠️  Skipped ${slug}: ${err.message}`);
		}
	}

	await context.close();
}

async function captureFrontendPages(browser) {
	if (FRONTEND_PAGES.length === 0) {
		console.log('\nℹ️  No frontend pages configured (set DONATION_FORM_SLUG / DONOR_DASHBOARD_SLUG to enable).');
		return;
	}

	const outDir = join(IMG_ROOT, 'frontend');
	await ensureDir(outDir);

	// Group by auth context so we only log in once per donor session.
	const guestPages = FRONTEND_PAGES.filter((p) => p.authAs === 'guest');
	const donorPages = FRONTEND_PAGES.filter((p) => p.authAs === 'donor');

	if (guestPages.length) {
		const ctx  = await browser.newContext({ viewport: VIEWPORT });
		const page = await ctx.newPage();

		for (const { slug, path } of guestPages) {
			const url = BASE + path;
			try {
				console.log(`📸 frontend/${slug}  ←  ${url}`);
				await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
				await page.waitForTimeout(800);
				await page.screenshot({ path: join(outDir, `${slug}.png`), fullPage: true });
			} catch (err) {
				console.warn(`   ⚠️  Skipped ${slug}: ${err.message}`);
			}
		}

		await ctx.close();
	}

	if (donorPages.length) {
		if (!DONOR_USER || !DONOR_PASS) {
			console.log('\nℹ️  Skipping logged-in donor screenshots (set WP_DONOR_USER / WP_DONOR_PASS to enable).');
			return;
		}

		const ctx  = await browser.newContext({ viewport: VIEWPORT });
		const page = await ctx.newPage();

		console.log(`\n🔐 Logging in as donor (${DONOR_USER})…`);
		await login(page, DONOR_USER, DONOR_PASS, 'donor');

		for (const { slug, path } of donorPages) {
			const url = BASE + path;
			try {
				console.log(`📸 frontend/${slug}  ←  ${url}`);
				await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
				await page.waitForTimeout(800);
				await page.screenshot({ path: join(outDir, `${slug}.png`), fullPage: true });
			} catch (err) {
				console.warn(`   ⚠️  Skipped ${slug}: ${err.message}`);
			}
		}

		await ctx.close();
	}
}

(async () => {
	const startedAt = Date.now();
	console.log(`\nDonorPress docs — screenshot run`);
	console.log(`Target: ${BASE}\n`);

	if (!ADMIN_USER || !ADMIN_PASS) {
		console.error('❌ Missing WP_ADMIN_USER / WP_ADMIN_PASS in .env.');
		console.error('   Copy docs/.env.example → docs/.env and fill it in.');
		process.exit(1);
	}

	const browser = await chromium.launch({ headless: true });
	try {
		await captureAdminPages(browser);
		await captureFrontendPages(browser);
	} finally {
		await browser.close();
	}

	const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
	console.log(`\n✅ Done in ${elapsed}s. Output: ${IMG_ROOT}`);
})();
