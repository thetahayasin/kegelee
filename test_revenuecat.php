<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

$settings = app(\App\Services\SettingsService::class);

$secretKey = (string) $settings->get('revenuecat_api_key');
$androidPublicKey = (string) $settings->get('revenuecat_android_public_sdk_key');
$iosPublicKey = (string) $settings->get('revenuecat_ios_public_sdk_key');
$entitlement = (string) $settings->get('revenuecat_entitlement_id', 'premium');
$enabled = (bool) $settings->get('revenuecat_enabled');

echo "=== RevenueCat Backend Configuration ===\n";
echo "Enabled: " . ($enabled ? "YES" : "NO") . "\n";
echo "Secret API Key: " . ($secretKey ? substr($secretKey, 0, 8) . '...' : 'NOT CONFIGURED') . "\n";
echo "Android Public SDK Key: " . ($androidPublicKey ? substr($androidPublicKey, 0, 10) . '...' : 'NOT CONFIGURED') . "\n";
echo "Entitlement ID: " . $entitlement . "\n\n";

if ($androidPublicKey) {
    echo "=== Testing Android Public SDK Key with RevenueCat API ===\n";
    // Ping RevenueCat v1 offerings endpoint with the Android public key (as the mobile app does)
    $testUser = 'test_device_diagnostics_' . time();
    $url = "https://api.revenuecat.com/v1/subscribers/" . urlencode($testUser) . "/offerings";
    
    $res = \Illuminate\Support\Facades\Http::withHeaders([
        'Authorization' => "Bearer {$androidPublicKey}",
        'X-Platform'    => 'android',
        'Accept'        => 'application/json',
    ])->get($url);

    echo "HTTP Status: " . $res->status() . "\n";
    if ($res->ok()) {
        $json = $res->json();
        $currentOffering = $json['current_offering_id'] ?? 'NONE';
        echo "Current Offering ID: {$currentOffering}\n";
        $offerings = $json['offerings'] ?? [];
        echo "Total Offerings configured: " . count($offerings) . "\n";
        foreach ($offerings as $off) {
            echo " - Offering: " . ($off['identifier'] ?? '') . " (" . ($off['description'] ?? '') . ")\n";
            $packages = $off['packages'] ?? [];
            foreach ($packages as $pkg) {
                echo "    * Package: " . ($pkg['identifier'] ?? '') . " -> Product: " . ($pkg['platform_product_identifier'] ?? '') . "\n";
            }
        }
    } else {
        echo "Response Body: " . $res->body() . "\n";
    }
}

if ($secretKey) {
    echo "\n=== Testing Secret API Key with RevenueCat API ===\n";
    $testUser = 'test_subscriber_' . time();
    $url = "https://api.revenuecat.com/v1/subscribers/" . urlencode($testUser);
    
    $res = \Illuminate\Support\Facades\Http::withHeaders([
        'Authorization' => "Bearer {$secretKey}",
        'Accept'        => 'application/json',
    ])->get($url);

    echo "HTTP Status: " . $res->status() . "\n";
    if ($res->ok()) {
        echo "Secret Key Status: VALID (Subscriber endpoint responded OK)\n";
    } else {
        echo "Response Body: " . $res->body() . "\n";
    }
}
