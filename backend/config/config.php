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
    ];

    return $config;
}
