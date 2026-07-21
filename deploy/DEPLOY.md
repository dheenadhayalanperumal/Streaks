# Streaks — cPanel deployment

Everything in `public_html/` is ready to upload as-is. The API lives at
`public_html/api/` and is served on the **same domain**, so no CORS setup is
needed for the default layout.

**Requirements:** PHP **8.0 or newer** (8.1+ recommended) with `pdo_mysql`,
MySQL 5.7+ / MariaDB 10.3+, and Apache with `mod_rewrite`.

---

## 1. Upload

In cPanel → **File Manager**, open `public_html` and upload
`streaks-cpanel.zip`, then **Extract**. You should end up with:

```
public_html/
├── .htaccess          routing, caching, dotfile deny
├── config.js          API origin — editable after deploy
├── index.html         customer check-in page
├── login/  admin/     admin console
├── _next/             hashed build assets (cached 1 year)
└── api/
    ├── .htaccess      front controller + Authorization passthrough
    ├── public/        index.php
    ├── src/           application code   (HTTP-denied)
    ├── config/        config loader      (HTTP-denied)
    ├── migrations/    .sql schema        (HTTP-denied)
    ├── bin/           seed + cron script (HTTP-denied)
    └── .env.example   copy this to .env
```

> Hidden files: File Manager hides dotfiles by default. Turn on
> **Settings → Show Hidden Files (dotfiles)**, or the `.htaccess` files will
> look missing — and without them the API returns 404 and `src/` is public.

## 2. Create the database

cPanel → **MySQL® Databases**: create a database and a user, and grant that user
**All Privileges** on it. cPanel prefixes both with your account name, e.g.
`myacct_streaks` / `myacct_streaksuser`.

Then cPanel → **phpMyAdmin** → select the database → **Import** and run, in order:

1. `migrations/schema.sql`
2. `migrations/002_geofence_and_calendar.sql`
3. `migrations/003_add_geofence_enabled.sql`
4. `migrations/004_brand_profile.sql`
5. `migrations/005_whatsapp.sql`
6. `migrations/006_reward_image_upload.sql`

`schema.sql` starts with `CREATE DATABASE` / `USE streaks`. On cPanel your
database is already created and differently named, so **delete those first three
lines** before importing, or phpMyAdmin will fail on insufficient privileges.

> **006 is not optional.** It widens `rewards.image` from `VARCHAR(500)` to
> `LONGTEXT`. Reward images are now uploads stored inline, and a real one is far
> larger than 500 characters — without this migration every image upload fails.

## 3. Configure the API

Copy `api/.env.example` to `api/.env` and set your real credentials:

```ini
DB_HOST=localhost
DB_PORT=3306
DB_NAME=myacct_streaks
DB_USER=myacct_streaksuser
DB_PASS=your-database-password

# Only needed if the admin UI is on a different origin than the API.
CORS_ORIGIN=https://yourdomain.com

ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=pick-something-strong
```

`.env` is denied over HTTP by `api/.htaccess`. Confirm after deploying —
see the checks in step 6.

## 4. Create the first admin user

`bin/seed.php` is blocked from the browser on purpose (it would let a visitor
reseed your data). Run it once over SSH or cPanel → **Terminal**:

```bash
cd ~/public_html/api && php bin/seed.php
```

It creates the admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` **and** inserts demo
campaigns, rewards and users. If you want a clean production database, create
just the admin instead:

```bash
cd ~/public_html/api && php -r '
require "config/config.php"; require "src/Core/Database.php";
$c = streaks_config();
Streaks\Core\Database::exec(
  "INSERT INTO admin_users (name, email, password_hash, role) VALUES (?,?,?,\"admin\")",
  ["Admin", $c["admin_email"], password_hash($c["admin_password"], PASSWORD_DEFAULT)]
);
echo "admin created: {$c["admin_email"]}\n";'
```

**Change the password after your first sign-in**, and do not leave the
`admin123` default anywhere near production.

## 5. Point the frontend at the API

`config.js` decides where the browser sends API calls, and it is read at
**runtime** — you can edit it on the server without rebuilding.

- **Same domain** (this package's default) — leave it empty:
  ```js
  window.__API_BASE__ = "";
  ```
- **API on a subdomain**, e.g. `api.yourdomain.com`:
  ```js
  window.__API_BASE__ = "https://api.yourdomain.com";
  ```
  Then also set `CORS_ORIGIN=https://yourdomain.com` in `api/.env`, or the
  browser will block every request.

## 6. Verify

```bash
curl https://yourdomain.com/api/health
# {"status":"ok","time":"..."}
```

These must **all** return 403 or 404 — if any returns content, the `.htaccess`
files did not upload:

```bash
curl -o /dev/null -w '%{http_code}\n' https://yourdomain.com/api/.env
curl -o /dev/null -w '%{http_code}\n' https://yourdomain.com/api/bin/seed.php
curl -o /dev/null -w '%{http_code}\n' https://yourdomain.com/api/src/Core/Database.php
curl -o /dev/null -w '%{http_code}\n' https://yourdomain.com/api/migrations/schema.sql
```

Then open `https://yourdomain.com/login/` and sign in, and
`https://yourdomain.com/` for the customer check-in page.

## 7. Nightly cron

Streaks are only marked broken when a period closes, so this needs to run daily.
cPanel → **Cron Jobs**, once per day just after midnight in your campaign's
timezone:

```
0 0 * * *  /usr/local/bin/php /home/YOURACCT/public_html/api/bin/close_periods.php
```

Use the PHP 8 binary path your host provides (cPanel often uses
`/opt/cpanel/ea-php81/root/usr/bin/php`).

---

## Troubleshooting

**Every API call 404s** — `mod_rewrite` is off, or `api/.htaccess` did not
upload. Check hidden files are visible in File Manager.

**"Missing bearer token" right after signing in** — the `Authorization` header
is being stripped by FastCGI. `api/.htaccess` already re-exposes it two ways; if
your host still strips it, ask support to enable
`CGIPassAuth On` for the account.

**500 on every API call** — almost always the database credentials in
`api/.env`. cPanel usernames are account-prefixed; `DB_HOST` is `localhost`, not
`127.0.0.1`, on most cPanel installs.

**Image upload fails / reward saves without its image** — migration 006 was not
applied. See step 2.

**Admin loads but every page is empty** — `config.js` points somewhere wrong.
Open the browser console; if requests go to `localhost:8080`, you are serving a
development build rather than this package.

## Re-deploying later

Replace the contents of `public_html/` **except** `api/.env` and `config.js` —
those two hold your environment-specific settings. `_next/` filenames are
content-hashed, so browsers pick up new assets immediately; `config.js` and HTML
are served no-cache for the same reason.
