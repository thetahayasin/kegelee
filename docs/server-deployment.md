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

### Production configuration handoff

The existing host's production environment was supplied on 2026-09-17. It
includes the original `APP_KEY`, local MySQL connection details, the Play
service-account JSON, Android App Link fingerprints and the deploy key. Keep
the values in a private server file; this repository records only their names.
The MySQL address is `127.0.0.1`, so it will refer to the **new** server's
MySQL instance after migration. Create/import that database and its local
account before pointing Laravel at it. Confirm the final connection values
against the new instance rather than assuming the old hosting account exists.

Merge the existing production settings with the private preview's
`APPLE_SIGN_IN_CLIENT_ID`, `APPLE_SIGN_IN_TEAM_ID`, `APPLE_SIGN_IN_KEY_ID` and
`APPLE_SIGN_IN_PRIVATE_KEY_PATH`. The old environment has no Apple fields.
Keep the developer `.p8` file in `shared/keys`, outside the webroot, readable
by the `kegelee` runtime user. The production `REVENUECAT_API_KEY` and
`REVENUECAT_WEBHOOK_SECRET` environment values are intentionally blank because
the admin panel stores them in `app_settings`; verify both after importing the
database. The SMTP environment is a log fallback for the same reason. The
Google Play RTDN fields are blank because that direct endpoint is unused.

After composing the private production environment on the new server, run the
static preflight as the runtime user before starting the app:

```bash
sudo -u kegelee php /var/www/kegelee/preview/scripts/preflight-production-env.php /var/www/kegelee/shared/production.env
```

The preflight prints field names and checks, never values. It does not connect
to MySQL or test the billing credentials stored in the database. Do not copy
the production environment into a release directory or commit it to Git.

### Data and cutover checks

1. Make a consistent SQL backup from the old host and inventory public uploads
   under `public/storage` plus any private files under `storage/app/private`.
   Record counts for `users`, `subscriptions`, `workout_sessions` and
   `app_settings`, along with the latest IDs and migration status. Keep the old
   host available for rollback.
2. Provision MySQL on the new server, create the database and account, and
   import the backup into a private staging copy first. Compare those four
   table counts and IDs with the source, and verify the `app_settings` rows for
   Google sign-in, SMTP, RevenueCat and public page settings. Do not print
   their secret values into command output or logs.
3. Point a private copy of the production environment at the staging import.
   Run `php artisan migrate:status`, then `php artisan migrate --force` and
   Laravel cache warmup there. Review migration errors and row counts before
   applying the same steps to the final imported database. Do not use
   `migrate:fresh`, `scripts/deploy-web.sh --seed`, or blanket content seeding
   against customer data.
4. Copy public uploads to `shared/uploads` and private files to persistent
   storage. Verify a sample of file hashes and permissions. Confirm the
   release's `public/storage` resolves to the shared uploads path, since the
   app's public disk writes there.
5. Make a final source backup/copy during a write pause, import it, and repeat
   the count and file checks. Set the production environment, run
   `php artisan migrate --force`, and rebuild Laravel caches. Configure the
   production HTTPS virtual host, queue worker and scheduler, then test the
   new origin before changing DNS. Verify login, progress pull/push, billing
   entitlement resolution, webhook authentication and mail delivery. Create
   the reviewer account only after the production data is available.
6. Switch DNS only after those checks pass. Retain the old host and backup for
   rollback, and monitor errors, queues and webhook deliveries after the
   switch. Then verify Apple sign-in, deletion, sandbox purchases and restores
   in TestFlight and complete the App Store review fields and privacy
   disclosures.

The iOS binary is already uploaded. These server credential changes alone do
not require a new native build.
