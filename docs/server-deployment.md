# Kegelee server deployment

## Verified state on 2026-09-17

The backend is installed on `149.102.129.143` as a **private preview**.
`kegelee.com` still resolves to `145.14.152.2`, where the Apple challenge route
returns HTTP 404. Public traffic has not been switched.

| Component | Location or state |
| --- | --- |
| Backend release | `/var/www/kegelee/releases/20260917-3b434fd` |
| Source commit | `3b434fd` |
| Preview symlink | `/var/www/kegelee/preview` |
| Shared files | `/var/www/kegelee/shared` |
| Runtime user | `kegelee` |
| PHP | PHP 8.4 FPM, dedicated `kegelee` pool |
| PHP socket | `/run/php/kegelee-fpm.sock` |
| Nginx configuration | `/etc/nginx/sites-available/kegelee-preview` |
| HTTP listener | `127.0.0.1:8189`, Host `kegelee.com` |
| Apple private key | Private file under `shared/keys`, readable by the runtime user |
| Environment | `shared/preview.env`, staging only, not the production environment |
| Database | None imported or seeded |

The PHP dependencies were installed from `composer.lock` without development
packages. Web assets were rebuilt and Laravel's config, route, event and view
caches warmed. The Sign in with Apple developer key is installed privately;
the separate purchase key is configured in RevenueCat. No private keys are
stored in Git or the webroot.

Verification through Nginx and PHP FPM:

- `GET /up`: HTTP 200.
- `POST /api/v1/auth/apple/challenge`: HTTP 200 with valid nonce/state lengths.
- `GET /.env`: HTTP 403; PHP execution in public uploads: HTTP 404.
- An untrusted Host header is rejected with HTTP 400.
- Both PHP 8.3 (existing sites) and PHP 8.4, plus Nginx, remain active.

The challenge check proves that this deployment can read the key and sign the
Apple client secret. It does not prove a successful device authorization or
purchase. No migrations were run against a customer database.

## Completing the migration

Obtain the existing host's production `.env`, database backup and uploaded
files, plus DNS management access. Preserve the existing `APP_KEY`: replacing
it can break encrypted values and existing sessions. The preview environment
contains a temporary key and intentionally references an absent database.
Do not publish it or seed the development database as production.

1. Back up the old host's database, configuration and uploads; coordinate a
   final copy so writes made during migration are retained.
2. Import its database and service settings, preserving user/subscription IDs,
   RevenueCat credentials, mail settings and the original `APP_KEY`. Copy public
   uploads into `shared/uploads` and relevant private storage separately.
3. Replace the preview environment with the production environment. Set
   `APP_ENV=production`, `APP_DEBUG=false`, the new database connection and the
   existing Apple configuration, using this server's private-key path.
4. Run `php artisan migrate --force` against the imported database, then rebuild
   Laravel caches. Do not run `migrate:fresh`, the development seeder or blanket
   content reseeding. Verify login, data counts, plan resolution, mail and the
   authenticated RevenueCat webhook. Create the reviewer account only after
   the production data is available.
5. Configure the production HTTPS virtual host, queue worker and scheduler.
   Test the new origin before changing DNS. Switch the domain with a rollback
   path to the old host and monitor application errors and webhook deliveries.
6. Verify Apple sign-in, deletion, sandbox purchases and restore in TestFlight.
   Complete the remaining App Store review fields and privacy disclosures.

The iOS binary is already uploaded. These server credential changes alone do
not require a new native build.
