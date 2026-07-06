<?php
declare(strict_types=1);

namespace Streaks\Services;

use Streaks\Core\Database;
use Streaks\Core\HttpException;
use DateTimeImmutable;
use DateTimeZone;

/**
 * Server-authoritative streak logic. The client only reports an action; every
 * streak transition and reward unlock is computed and persisted here.
 */
final class StreakEngine
{
    /**
     * Integer index of the period that `$when` falls into, for a campaign.
     * Consecutive periods differ by exactly 1. Timezone-aware so period
     * boundaries follow the campaign's configured timezone.
     */
    public static function periodIndex(array $campaign, DateTimeImmutable $when): int
    {
        $tz  = new DateTimeZone($campaign['timezone'] ?: 'UTC');
        $dt  = $when->setTimezone($tz);

        if ($campaign['type'] === 'monthly') {
            return ((int) $dt->format('Y')) * 12 + ((int) $dt->format('n') - 1);
        }

        $anchor = new DateTimeImmutable(($campaign['start_date'] ?: '1970-01-01') . ' 00:00:00', $tz);
        $days = (int) floor(
            ($dt->setTime(0, 0)->getTimestamp() - $anchor->setTime(0, 0)->getTimestamp()) / 86400
        );

        return match ($campaign['type']) {
            'daily'  => $days,
            'weekly' => (int) floor($days / 7),
            'custom' => (int) floor($days / max(1, (int) ($campaign['custom_period_days'] ?: 1))),
            default  => $days,
        };
    }

    /** Human-readable label for a period, e.g. "Day 5" style keys for events. */
    public static function periodKey(array $campaign, int $index): string
    {
        return $campaign['type'] . ':' . $index;
    }

    /**
     * Record a qualifying action for an enrollment and advance/reset the streak.
     * Idempotent per period: a second action in the same period does not double-count.
     */
    public static function recordAction(
        int $enrollmentId,
        ?float $lat,
        ?float $lng,
        ?DateTimeImmutable $when = null
    ): array
    {
        $pdo = Database::pdo();
        $when ??= new DateTimeImmutable('now');

        $enrollment = Database::one(
            'SELECT e.*, c.type, c.custom_period_days, c.missed_day_behaviour, c.timezone,
                    c.start_date, c.end_date, c.active AS campaign_active, c.name AS campaign_name,
                    c.latitude, c.longitude, c.geofence_radius_m, c.geofence_enabled
               FROM enrollments e
               JOIN campaigns c ON c.id = e.campaign_id
              WHERE e.id = ?',
            [$enrollmentId]
        );
        if ($enrollment === null) {
            throw new HttpException(404, 'Enrollment not found');
        }
        if (!$enrollment['campaign_active']) {
            throw new HttpException(422, 'Campaign is not active');
        }

        // Geofence validation.
        if ($enrollment['geofence_enabled']) {
            if ($lat === null || $lng === null) {
                throw new HttpException(422, 'Missing location for geofenced campaign');
            }
            $dist = self::haversineGreatCircleDistance(
                (float) $enrollment['latitude'],
                (float) $enrollment['longitude'],
                $lat,
                $lng
            );
            if ($dist > (float) $enrollment['geofence_radius_m']) {
                throw new HttpException(422, 'Please check-in at the nearby brand location.');
            }
        }

        $campaign = [
            'type'               => $enrollment['type'],
            'custom_period_days' => $enrollment['custom_period_days'],
            'timezone'           => $enrollment['timezone'],
            'start_date'         => $enrollment['start_date'],
        ];

        $index = self::periodIndex($campaign, $when);
        $periodKey = self::periodKey($enrollment, $index);

        $pdo->beginTransaction();
        try {
            // Lock the streak row (create on first action).
            $streak = Database::one('SELECT * FROM streaks WHERE enrollment_id = ? FOR UPDATE', [$enrollmentId]);
            if ($streak === null) {
                Database::insert('INSERT INTO streaks (enrollment_id, current_count) VALUES (?, 0)', [$enrollmentId]);
                $streak = Database::one('SELECT * FROM streaks WHERE enrollment_id = ? FOR UPDATE', [$enrollmentId]);
            }

            $lastIndex = $streak['last_period_index'] !== null ? (int) $streak['last_period_index'] : null;

            // Already completed this period -> idempotent no-op.
            if ($lastIndex !== null && $lastIndex === $index) {
                $pdo->commit();
                return [
                    'status'        => 'already_completed',
                    'current_count' => (int) $streak['current_count'],
                    'longest_count' => (int) $streak['longest_count'],
                    'period_key'    => $periodKey,
                    'reward'        => null,
                ];
            }

            // Determine new count.
            if ($lastIndex === null) {
                $newCount = 1;
            } elseif ($index - $lastIndex === 1) {
                $newCount = (int) $streak['current_count'] + 1;          // consecutive
            } else {
                // Gap of more than one period.
                if ($enrollment['missed_day_behaviour'] === 'no_break') {
                    $newCount = (int) $streak['current_count'] + 1;      // grace: preserve & advance
                } else {
                    $newCount = 1;                                       // break: start over
                }
            }

            $longest = max((int) $streak['longest_count'], $newCount);

            Database::exec(
                'UPDATE streaks
                    SET current_count = ?, longest_count = ?, last_period_index = ?,
                        last_completed_at = ?, status = "active"
                  WHERE enrollment_id = ?',
                [$newCount, $longest, $index, $when->format('Y-m-d H:i:s'), $enrollmentId]
            );

            Database::insert(
                'INSERT INTO streak_events (enrollment_id, event_type, period_key, period_index, streak_count)
                 VALUES (?, "completed", ?, ?, ?)',
                [$enrollmentId, $periodKey, $index, $newCount]
            );

            // Milestone reward check (idempotent per milestone per streak-run).
            $reward = self::maybeIssueMilestone($enrollment, $newCount);

            $pdo->commit();

            return [
                'status'        => $newCount === 1 && $lastIndex !== null && $enrollment['missed_day_behaviour'] === 'break'
                                    ? 'reset_then_advanced' : 'advanced',
                'current_count' => $newCount,
                'longest_count' => $longest,
                'period_key'    => $periodKey,
                'reward'        => $reward,
            ];
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }
private static function haversineGreatCircleDistance(
        float $latitudeFrom,
        float $longitudeFrom,
        float $latitudeTo,
        float $longitudeTo,
        float $earthRadius = 6371000
    ): float {
        $latFrom = deg2rad($latitudeFrom);
        $lonFrom = deg2rad($longitudeFrom);
        $latTo = deg2rad($latitudeTo);
        $lonTo = deg2rad($longitudeTo);

        $latDelta = $latTo - $latFrom;
        $lonDelta = $lonTo - $lonFrom;

        $angle = 2 * asin(sqrt(pow(sin($latDelta / 2), 2) +
            cos($latFrom) * cos($latTo) * pow(sin($lonDelta / 2), 2)));
        return $angle * $earthRadius;
    }
    /**
     * Issue the milestone reward for this streak count, if one is configured and
     * not already issued for the current streak-run. Returns the issued reward or null.
     */
    private static function maybeIssueMilestone(array $enrollment, int $count): ?array
    {
        $milestone = Database::one(
            'SELECT m.*, r.title, r.type AS reward_type, r.value, r.validity_days
               FROM milestones m
               JOIN rewards r ON r.id = m.reward_id
              WHERE m.campaign_id = ? AND m.streak_count = ? AND r.active = 1',
            [$enrollment['campaign_id'], $count]
        );
        if ($milestone === null) {
            return null;
        }

        // A "streak-run" is identified by the period index at which this run started,
        // making milestone issuance idempotent even if the same count recurs later.
        $streakRun = self::currentRunStart($enrollment['id'], $count);

        $existing = Database::one(
            'SELECT id FROM reward_issues WHERE user_id = ? AND milestone_id = ? AND streak_run = ?',
            [$enrollment['user_id'], $milestone['id'], $streakRun]
        );
        if ($existing !== null) {
            return null;
        }

        $code = strtoupper(bin2hex(random_bytes(4)));
        $expires = $milestone['validity_days']
            ? (new DateTimeImmutable())->modify('+' . (int) $milestone['validity_days'] . ' days')->format('Y-m-d H:i:s')
            : null;

        Database::insert(
            'INSERT INTO reward_issues (user_id, reward_id, milestone_id, enrollment_id, streak_run, code, status, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, "unlocked", ?)',
            [$enrollment['user_id'], $milestone['reward_id'], $milestone['id'], $enrollment['id'], $streakRun, $code, $expires]
        );

        Database::insert(
            'INSERT INTO streak_events (enrollment_id, event_type, streak_count, meta)
             VALUES (?, "reward_unlocked", ?, ?)',
            [$enrollment['id'], $count, json_encode(['reward_id' => (int) $milestone['reward_id'], 'title' => $milestone['title'], 'code' => $code])]
        );

        return [
            'reward__id' => (int) $milestone['reward_id'],
            'title'     => $milestone['title'],
            'type'      => $milestone['reward_type'],
            'value'     => $milestone['value'],
            'code'      => $code,
            'milestone' => $count,
        ];
    }

    /** Period index at which the current unbroken run started (for idempotency keys). */
    private static function currentRunStart(int $enrollmentId, int $count): int
    {
        $row = Database::one(
            'SELECT MIN(period_index) AS start_idx FROM streak_events
              WHERE enrollment_id = ? AND event_type = "completed"
                AND period_index > COALESCE((
                    SELECT MAX(period_index) FROM streak_events
                     WHERE enrollment_id = ? AND event_type IN ("broken","missed")
                ), -1)',
            [$enrollmentId, $enrollmentId]
        );
        return (int) ($row['start_idx'] ?? 0);
    }

    /**
     * Close a period: for every active enrollment that did NOT complete the given
     * (already-elapsed) period, log a miss and apply the campaign's missed-day
     * behaviour. Called by the scheduled job.
     *
     * @return array Summary counts.
     */
    public static function closePeriods(?DateTimeImmutable $now = null): array
    {
        $now ??= new DateTimeImmutable('now');
        $campaigns = Database::all('SELECT * FROM campaigns WHERE active = 1');

        $missed = 0; $broken = 0;

        foreach ($campaigns as $campaign) {
            $currentIndex = self::periodIndex($campaign, $now);
            $closedIndex  = $currentIndex - 1;   // the period that just elapsed

            $enrollments = Database::all(
                'SELECT e.id, e.user_id, s.current_count, s.last_period_index, s.status
                   FROM enrollments e
                   JOIN streaks s ON s.enrollment_id = e.id
                  WHERE e.campaign_id = ? AND e.status = "active"',
                [$campaign['id']]
            );

            foreach ($enrollments as $e) {
                $last = $e['last_period_index'] !== null ? (int) $e['last_period_index'] : null;

                // Completed the closed period (or later) -> nothing to do.
                if ($last !== null && $last >= $closedIndex) {
                    continue;
                }
                // Already broken and idle -> nothing to do.
                if ($e['status'] === 'broken' && (int) $e['current_count'] === 0) {
                    continue;
                }

                $periodKey = self::periodKey($campaign, $closedIndex);

                if ($campaign['missed_day_behaviour'] === 'no_break') {
                    Database::insert(
                        'INSERT INTO streak_events (enrollment_id, event_type, period_key, period_index)
                         VALUES (?, "missed", ?, ?)',
                        [$e['id'], $periodKey, $closedIndex]
                    );
                    Database::exec('UPDATE streaks SET missed_count = missed_count + 1 WHERE enrollment_id = ?', [$e['id']]);
                    $missed++;
                } else {
                    Database::insert(
                        'INSERT INTO streak_events (enrollment_id, event_type, period_key, period_index, streak_count)
                         VALUES (?, "broken", ?, ?, 0)',
                        [$e['id'], $periodKey, $closedIndex]
                    );
                    Database::exec(
                        'UPDATE streaks
                            SET current_count = 0, status = "broken", missed_count = missed_count + 1
                          WHERE enrollment_id = ?',
                        [$e['id']]
                    );
                    $broken++;
                }
            }
        }

        return ['missed' => $missed, 'broken' => $broken, 'campaigns' => count($campaigns)];
    }
}