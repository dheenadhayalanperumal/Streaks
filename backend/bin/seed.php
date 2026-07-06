<?php
declare(strict_types=1);

/**
 * Seeds an admin user plus demo campaigns, rewards, milestones, users and
 * some streak activity so the dashboard has data. Run:  php bin/seed.php
 */

require __DIR__ . '/../config/config.php';
spl_autoload_register(function (string $class): void {
    $rel = str_replace('\\', '/', substr($class, strlen('Streaks\\')));
    $file = __DIR__ . '/../src/' . $rel . '.php';
    if (str_starts_with($class, 'Streaks\\') && is_file($file)) {
        require $file;
    }
});

use Streaks\Core\Database;
use Streaks\Services\StreakEngine;

$cfg = streaks_config();
$pdo = Database::pdo();

echo "Seeding Streaks demo data...\n";

// Admin user
$hash = password_hash($cfg['admin_password'], PASSWORD_DEFAULT);
Database::exec(
    'INSERT INTO admin_users (name, email, password_hash, role) VALUES (?, ?, ?, "admin")
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)',
    ['Streaks Admin', $cfg['admin_email'], $hash]
);
echo "  admin: {$cfg['admin_email']} / {$cfg['admin_password']}\n";

// Rewards
$rewards = [
    ['Bronze Badge',   'Awarded for a 3-day streak',   'badge',  'bronze', null, 30],
    ['10% Coupon',     'Save 10% on your next order',  'coupon', '10%',    null, 14],
    ['500 Points',     'Bonus loyalty points',         'points', '500',    null, 60],
    ['Free Delivery',  'One free delivery',            'coupon', 'FREESHIP', null, 7],
    ['Gold Badge',     'Awarded for a 30-day streak',  'badge',  'gold',   null, null],
];
$rewardIds = [];
foreach ($rewards as $r) {
    $rewardIds[] = Database::insert(
        'INSERT INTO rewards (title, description, type, value, image, validity_days) VALUES (?,?,?,?,?,?)',
        $r
    );
}

// Campaigns
$dailyId = Database::insert(
    'INSERT INTO campaigns (name, description, type, missed_day_behaviour, qualifying_action, timezone, start_date, active)
     VALUES (?,?,?,?,?,?,?,1)',
    ['Daily Check-in', 'Check in every day to build your streak', 'daily', 'break', 'check_in', 'Asia/Kolkata', date('Y-m-d', strtotime('-40 days'))]
);
$weeklyId = Database::insert(
    'INSERT INTO campaigns (name, description, type, missed_day_behaviour, qualifying_action, timezone, start_date, active)
     VALUES (?,?,?,?,?,?,?,1)',
    ['Weekly Workout', 'Log one workout per week', 'weekly', 'no_break', 'workout', 'Asia/Kolkata', date('Y-m-d', strtotime('-20 weeks'))]
);

// Milestones for daily campaign
foreach ([[3, $rewardIds[0]], [7, $rewardIds[1]], [14, $rewardIds[2]], [30, $rewardIds[4]]] as [$count, $rid]) {
    Database::insert('INSERT INTO milestones (campaign_id, streak_count, reward_id) VALUES (?,?,?)', [$dailyId, $count, $rid]);
}
foreach ([[4, $rewardIds[3]], [8, $rewardIds[2]]] as [$count, $rid]) {
    Database::insert('INSERT INTO milestones (campaign_id, streak_count, reward_id) VALUES (?,?,?)', [$weeklyId, $count, $rid]);
}

// Reward calendar entry
Database::insert(
    'INSERT INTO reward_calendar (campaign_id, reward_id, date, note) VALUES (?,?,?,?)',
    [$dailyId, $rewardIds[1], date('Y-m-d', strtotime('+3 days')), 'Festival bonus coupon']
);

// Participants + simulated daily activity
$names = ['John Doe','Jane Smith','Aarav Kumar','Meera Nair','Liam Brown','Sofia Garcia','Noah Wilson','Priya Patel','Omar Ali','Emma Davis'];
$daily = Database::one('SELECT * FROM campaigns WHERE id = ?', [$dailyId]);

foreach ($names as $i => $name) {
    $uid = Database::insert('INSERT INTO users (name, identifier) VALUES (?, ?)', [$name, 'user' . ($i + 1) . '@demo.test']);
    $enrollmentId = Database::insert('INSERT INTO enrollments (user_id, campaign_id) VALUES (?, ?)', [$uid, $dailyId]);
    Database::insert('INSERT INTO streaks (enrollment_id) VALUES (?)', [$enrollmentId]);

    // Each user has completed the last N consecutive days (varies per user).
    $streakLen = [12, 8, 30, 3, 1, 6, 15, 4, 0, 7][$i];
    for ($d = $streakLen; $d >= 1; $d--) {
        $when = new DateTimeImmutable('-' . ($d - 1) . ' days 12:00:00');
        StreakEngine::recordAction($enrollmentId, null, null, $when);
    }
}

echo "  campaigns: {$dailyId} (daily), {$weeklyId} (weekly)\n";
echo "  users: " . count($names) . "\n";
echo "Done.\n";
