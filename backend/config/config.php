<?php
declare(strict_types=1);

/**
 * Loads .env (falling back to .env.example) into a config array.
 */
function streaks_config(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }

    $root = dirname(__DIR__);
    $envFile = file_exists($root . '/.env') ? $root . '/.env' : $root . '/.env.example';

    $vars = [];
    if (is_readable($envFile)) {
        foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#') {
                continue;
            }
            [$k, $v] = array_pad(explode('=', $line, 2), 2, '');
            $vars[trim($k)] = trim($v);
        }
    }

    // Environment variables win over the file.
    $get = fn(string $k, string $d = '') => getenv($k) !== false ? getenv($k) : ($vars[$k] ?? $d);

    $config = [
        'db' => [
            'host' => $get('DB_HOST', '127.0.0.1'),
            'port' => $get('DB_PORT', '3306'),
            'name' => $get('DB_NAME', 'streaks'),
            'user' => $get('DB_USER', 'root'),
            'pass' => $get('DB_PASS', ''),
        ],
        'cors_origin'    => $get('CORS_ORIGIN', 'http://localhost:3000'),
        'admin_email'    => $get('ADMIN_EMAIL', 'admin@streaks.test'),
        'admin_password' => $get('ADMIN_PASSWORD', 'admin123'),

        // WhatsApp Business Cloud API. Leave the token / phone-number id blank
        // to run in SIMULATION mode (messages are logged, never sent to Meta).
        'whatsapp' => [
            'access_token'         => $get('WHATSAPP_ACCESS_TOKEN', ''),
            'phone_number_id'      => $get('WHATSAPP_PHONE_NUMBER_ID', ''),
            'api_version'          => $get('WHATSAPP_API_VERSION', 'v25.0'),
            'template_lang'        => $get('WHATSAPP_TEMPLATE_LANG', 'en_US'),
            'default_country_code' => $get('WHATSAPP_DEFAULT_COUNTRY_CODE', '91'),
            'verify_token'         => $get('WHATSAPP_VERIFY_TOKEN', 'streaks-verify'),
        ],
    ];

    return $config;
}
