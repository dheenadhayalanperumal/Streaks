<?php
declare(strict_types=1);

/**
 * Scheduled job — closes each elapsed period and applies missed-day behaviour
 * (break vs. preserve) per campaign rules. Schedule via cron, e.g. hourly:
 *   0 * * * *  php /path/to/backend/bin/close_periods.php >> /var/log/streaks.log 2>&1
 */

require __DIR__ . '/../config/config.php';
spl_autoload_register(function (string $class): void {
    $rel = str_replace('\\', '/', substr($class, strlen('Streaks\\')));
    $file = __DIR__ . '/../src/' . $rel . '.php';
    if (str_starts_with($class, 'Streaks\\') && is_file($file)) {
        require $file;
    }
});

use Streaks\Services\StreakEngine;

$summary = StreakEngine::closePeriods();
printf("[%s] closePeriods: %d campaigns, %d missed, %d broken\n",
    date('c'), $summary['campaigns'], $summary['missed'], $summary['broken']);
