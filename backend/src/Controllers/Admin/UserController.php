<?php
declare(strict_types=1);

namespace Streaks\Controllers\Admin;

use Streaks\Core\Database;
use Streaks\Core\HttpException;
use Streaks\Core\Request;
use Streaks\Core\Validate;
use Streaks\Services\StreakEngine;

final class UserController
{
    /** GET /api/admin/users?search= */
    public function index(Request $req): array
    {
        $search = trim((string) ($req->query['search'] ?? ''));
        $where = '';
        $params = [];
        if ($search !== '') {
            $where = 'WHERE u.name LIKE ? OR u.identifier LIKE ?';
            $params = ["%$search%", "%$search%"];
        }
        $rows = Database::all(
            "SELECT u.id, u.name, u.identifier, u.created_at,
                    COALESCE(MAX(s.current_count), 0) AS current_streak,
                    COALESCE(MAX(s.longest_count), 0) AS longest_streak,
                    COALESCE(SUM(s.missed_count), 0)  AS missed_days,
                    (SELECT COUNT(*) FROM reward_issues ri WHERE ri.user_id = u.id) AS rewards_earned,
                    MAX(s.last_completed_at) AS last_activity
               FROM users u
               LEFT JOIN enrollments e ON e.user_id = u.id
               LEFT JOIN streaks s ON s.enrollment_id = e.id
               $where
              GROUP BY u.id
              ORDER BY last_activity DESC, u.id DESC
              LIMIT 500",
            $params
        );
        return ['users' => $rows];
    }

    /** GET /api/admin/users/:id */
    public function show(Request $req): array
    {
        $id = (int) $req->params['id'];
        $user = Database::one('SELECT * FROM users WHERE id = ?', [$id]);
        if ($user === null) {
            throw new HttpException(404, 'User not found');
        }

        $user['enrollments'] = Database::all(
            'SELECT e.id AS enrollment_id, c.id AS campaign_id, c.name AS campaign_name, c.type,
                    s.current_count, s.longest_count, s.missed_count, s.status, s.last_completed_at
               FROM enrollments e
               JOIN campaigns c ON c.id = e.campaign_id
               LEFT JOIN streaks s ON s.enrollment_id = e.id
              WHERE e.user_id = ?',
            [$id]
        );

        $user['timeline'] = Database::all(
            'SELECT se.event_type, se.period_key, se.streak_count, se.meta, se.occurred_at, c.name AS campaign_name
               FROM streak_events se
               JOIN enrollments e ON e.id = se.enrollment_id
               JOIN campaigns c ON c.id = e.campaign_id
              WHERE e.user_id = ?
              ORDER BY se.occurred_at DESC
              LIMIT 200',
            [$id]
        );

        $user['rewards'] = Database::all(
            'SELECT ri.id, ri.code, ri.status, ri.issued_at, ri.expires_at, r.title, r.type, r.value
               FROM reward_issues ri JOIN rewards r ON r.id = ri.reward_id
              WHERE ri.user_id = ? ORDER BY ri.issued_at DESC',
            [$id]
        );

        return ['user' => $user];
    }

    /** POST /api/admin/users/:id/adjust-streak  { enrollment_id, current_count } */
    public function adjustStreak(Request $req): array
    {
        $enrollmentId = Validate::int($req->input('enrollment_id'), 'enrollment_id', 1, 4294967295);
        $count = Validate::int($req->input('current_count'), 'current_count', 0, 3650);

        $streak = Database::one('SELECT * FROM streaks WHERE enrollment_id = ?', [$enrollmentId]);
        if ($streak === null) {
            throw new HttpException(404, 'Streak not found');
        }
        Database::exec(
            'UPDATE streaks SET current_count = ?, longest_count = GREATEST(longest_count, ?),
                    status = IF(? > 0, "active", "broken") WHERE enrollment_id = ?',
            [$count, $count, $count, $enrollmentId]
        );
        Database::insert(
            'INSERT INTO streak_events (enrollment_id, event_type, streak_count, meta)
             VALUES (?, "admin_adjust", ?, ?)',
            [$enrollmentId, $count, json_encode(['by' => 'admin'])]
        );
        return ['ok' => true, 'enrollment_id' => $enrollmentId, 'current_count' => $count];
    }
}
