<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'apple' => [
        'client_id' => env('APPLE_SIGN_IN_CLIENT_ID', 'com.kegelee.app'),
        'team_id' => env('APPLE_SIGN_IN_TEAM_ID', '68P36W8488'),
        'key_id' => env('APPLE_SIGN_IN_KEY_ID'),
        'private_key_path' => env('APPLE_SIGN_IN_PRIVATE_KEY_PATH'),
    ],

    'revenuecat' => [
        'api_key' => env('REVENUECAT_API_KEY', ''),
        'webhook_secret' => env('REVENUECAT_WEBHOOK_SECRET', ''),
        'entitlement_id' => env('REVENUECAT_ENTITLEMENT_ID', 'premium'),
    ],

    'google_play' => [
        // Your app's package name as registered on the Play Console
        'package_name' => env('GOOGLE_PLAY_PACKAGE_NAME', 'com.kegelee.app'),

        // SHA-256 signing certificate fingerprint(s) published in
        // /.well-known/assetlinks.json so Android opens our https links in the
        // app. Usually two: the upload key and the key Play re-signs with.
        // Comma-separated.
        'app_link_sha256' => env('ANDROID_APP_LINK_SHA256', ''),
        // Full JSON content of your Google service account key file
        'service_account_json' => env('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON'),

        // Real-Time Developer Notifications arrive as Pub/Sub pushes, and a
        // push is only trustworthy if it is signed. In the Pub/Sub push
        // subscription turn on "Enable authentication", pick a service account
        // and set an audience string; Google then signs every push with an OIDC
        // token carrying both. Unset, the RTDN endpoint refuses everything
        // rather than acting on an unauthenticated request body.
        'rtdn_audience' => env('GOOGLE_PLAY_RTDN_AUDIENCE', ''),
        'rtdn_service_account' => env('GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT', ''),
    ],

];
