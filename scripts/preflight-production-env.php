<?php

declare(strict_types=1);

use Dotenv\Dotenv;

require dirname(__DIR__).'/vendor/autoload.php';

if ($argc !== 2) {
    fwrite(STDERR, "Usage: php scripts/preflight-production-env.php /private/path/production.env\n");
    exit(2);
}

$path = $argv[1];
if (! is_file($path) || ! is_readable($path)) {
    fwrite(STDERR, "Environment file is missing or unreadable.\n");
    exit(2);
}

try {
    $env = Dotenv::parse((string) file_get_contents($path));
} catch (Throwable) {
    // Dotenv errors can include the source line, which may contain a secret.
    fwrite(STDERR, "Environment file has invalid dotenv syntax.\n");
    exit(2);
}

$value = static fn (string $key): string => trim((string) ($env[$key] ?? ''));
$issues = [];

foreach ([
    'APP_KEY', 'DB_HOST', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD',
    'DEPLOY_KEY', 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON',
    'APPLE_SIGN_IN_CLIENT_ID', 'APPLE_SIGN_IN_TEAM_ID',
    'APPLE_SIGN_IN_KEY_ID', 'APPLE_SIGN_IN_PRIVATE_KEY_PATH',
] as $key) {
    if ($value($key) === '') {
        $issues[] = "$key is missing or empty";
    }
}

foreach ([
    'APP_ENV' => 'production',
    'APP_DEBUG' => 'false',
    'APP_URL' => 'https://kegelee.com',
    'DB_CONNECTION' => 'mysql',
    'SESSION_DRIVER' => 'database',
    'CACHE_STORE' => 'database',
    'QUEUE_CONNECTION' => 'database',
    'APP_DEEPLINK_SCHEME' => 'kegelee',
    'GOOGLE_PLAY_PACKAGE_NAME' => 'com.kegelee.app',
] as $key => $expected) {
    if ($value($key) !== $expected) {
        $issues[] = "$key must be $expected";
    }
}

$appKey = $value('APP_KEY');
if ($appKey !== '' && (! str_starts_with($appKey, 'base64:')
    || strlen((string) base64_decode(substr($appKey, 7), true)) !== 32)) {
    $issues[] = 'APP_KEY must be a base64-encoded 32-byte Laravel key';
}

$port = $value('DB_PORT');
if (filter_var($port, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 65535]]) === false) {
    $issues[] = 'DB_PORT must be a valid TCP port';
}

$serviceAccount = json_decode($value('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON'), true);
if ($value('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON') !== '' &&
    (! is_array($serviceAccount) || ($serviceAccount['type'] ?? null) !== 'service_account'
        || empty($serviceAccount['client_email']) || empty($serviceAccount['private_key']))) {
    $issues[] = 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON must contain a service account key';
}

$appleKeyPath = $value('APPLE_SIGN_IN_PRIVATE_KEY_PATH');
if ($appleKeyPath !== '' && (! str_starts_with($appleKeyPath, '/') || ! is_readable($appleKeyPath))) {
    $issues[] = 'APPLE_SIGN_IN_PRIVATE_KEY_PATH must be an absolute, readable file';
}

$fingerprints = $value('ANDROID_APP_LINK_SHA256');
if ($fingerprints === '' || array_filter(explode(',', $fingerprints), static function (string $fingerprint): bool {
    $hex = str_replace(':', '', trim($fingerprint));

    return strlen($hex) !== 64 || ! ctype_xdigit($hex);
}) !== []) {
    $issues[] = 'ANDROID_APP_LINK_SHA256 must contain SHA-256 fingerprint(s)';
}

if ($issues !== []) {
    fwrite(STDERR, "Production environment preflight: FAIL\n");
    foreach ($issues as $issue) {
        fwrite(STDERR, "- $issue\n");
    }
    exit(1);
}

fwrite(STDOUT, "Production environment preflight: PASS\n");
fwrite(STDOUT, "Static checks only. Verify the database, stored settings, uploads, and Apple authorization separately.\n");
