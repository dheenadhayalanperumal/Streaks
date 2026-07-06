<?php
declare(strict_types=1);

namespace Streaks\Controllers\Admin;

use Streaks\Core\Database;
use Streaks\Core\Request;

final class StatsController
{
    /** GET /api/admin/stats — dashboard KPI counters. */
    public function stats(): array
    {
        $activeStreaks = (int) (Database::one(
            'SELECT COUNT(*) n FROM streaks WHERE status = "active" AND current_count > 0'
        )['n'] ?? 0);

        $longest = (int) (Database::one('SELECT COALESCE(MAX(longest_count),0) n FROM streaks')['n'] ?? 0);
        $rewardsIssued = (int) (Database::one('SELECT COUNT(*) n FROM reward_issues')['n'] ?? 0);
        $avg = round((float) (Database::one(
            'SELECT COALESCE(AVG(current_count),0) a FROM streaks WHERE current_count > 0'
        )['a'] ?? 0), 1);
        $missed = (int) (Database::one('SELECT COALESCE(SUM(missed_count),0) n FROM streaks')['n'] ?? 0);

        // Completion rate for the current period across active campaigns:
        // enrollments that completed within their current period / total active enrollments.
        $enrolled = (int) (Database::one(
            'SELECT COUNT(*) n FROM enrollments e JOIN campaigns c ON c.id = e.campaign_id
              WHERE e.status = "active" AND c.active = 1'
        )['n'] ?? 0);
        $completedToday = (int) (Database::one(
            'SELECT COUNT(DISTINCT se.enrollment_id) n
               FROM streak_events se
               JOIN enrollments e ON e.id = se.enrollment_id
               JOIN campaigns c ON c.id = e.campaign_id
              WHERE se.event_type = "completed"
                AND se.occurred_at >= (CURDATE())
                AND c.active = 1'
        )['n'] ?? 0);
        $completionRate = $enrolled > 0 ? round($completedToday / $enrolled * 100, 1) : 0.0;

        return [
            'active_streaks'  => $activeStreaks,
            'longest_streak'  => $longest,
            'rewards_issued'  => $rewardsIssued,
            'average_streak'  => $avg,
            'missed_days'     => $missed,
            'completion_rate' => $completionRate,
            'total_users'     => (int) (Database::one('SELECT COUNT(*) n FROM users')['n'] ?? 0),
            'total_campaigns' => (int) (Database::one('SELECT COUNT(*) n FROM campaigns WHERE active = 1')['n'] ?? 0),
        ];
    }

    /** GET /api/admin/analytics?days=14&campaign_id= — graph/report data. */
    public function analytics(Request $req): array
    {
        $days = min(90, max(1, (int) ($req->query['days'] ?? 14)));
        $campaignFilter = isset($req->query['campaign_id']) && $req->query['campaign_id'] !== ''
            ? (int) $req->query['campaign_id'] : null;

        $params = [$days];
        $campaignJoin = '';
        if ($campaignFilter !== null) {
            $campaignJoin = 'AND e.campaign_id = ?';
            $params[] = $campaignFilter;
        }

        // Daily Active Users — distinct enrollments completing per day.
        $dau = Database::all(
            "SELECT DATE(se.occurred_at) AS day, COUNT(DISTINCT se.enrollment_id) AS users
               FROM streak_events se
               JOIN enrollments e ON e.id = se.enrollment_id
              WHERE se.event_type = 'completed'
                AND se.occurred_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY) $campaignJoin
              GROUP BY DATE(se.occurred_at) ORDER BY day",
            $params
        );

        // Streak Distribution — histogram buckets of current streak length.
        $distribution = Database::all(
            "SELECT CASE
                        WHEN current_count = 0 THEN '0'
                        WHEN current_count BETWEEN 1 AND 3 THEN '1-3'
                        WHEN current_count BETWEEN 4 AND 7 THEN '4-7'
                        WHEN current_count BETWEEN 8 AND 14 THEN '8-14'
                        WHEN current_count BETWEEN 15 AND 30 THEN '15-30'
                        ELSE '30+' END AS bucket,
                    COUNT(*) AS users
               FROM streaks GROUP BY bucket
               ORDER BY FIELD(bucket,'0','1-3','4-7','8-14','15-30','30+')"
        );

        // Milestone Redemption — unlocks & redemptions per milestone streak_count.
        $milestoneParams = [];
        $milestoneWhere = '';
        if ($campaignFilter !== null) {
            $milestoneWhere = 'WHERE m.campaign_id = ?';
            $milestoneParams[] = $campaignFilter;
        }
        $milestoneFunnel = Database::all(
            "SELECT m.streak_count,
                    COUNT(ri.id) AS unlocked,
                    SUM(ri.status = 'redeemed') AS redeemed
               FROM milestones m
               LEFT JOIN reward_issues ri ON ri.milestone_id = m.id
               $milestoneWhere
              GROUP BY m.streak_count ORDER BY m.streak_count",
            $milestoneParams
        );

        return [
            'daily_active_users'   => $dau,
            'streak_distribution'  => $distribution,
            'milestone_redemption' => $milestoneFunnel,
        ];
    }

    /** GET /api/admin/activity?limit=20 — recent activity feed. */
    public function activity(Request $req): array
    {
        $limit = min(100, max(1, (int) ($req->query['limit'] ?? 20)));
        $rows = Database::all(
            "SELECT se.event_type, se.streak_count, se.meta, se.occurred_at,
                    u.name AS user_name, u.identifier, c.name AS campaign_name
               FROM streak_events se
               JOIN enrollments e ON e.id = se.enrollment_id
               JOIN users u ON u.id = e.user_id
               JOIN campaigns c ON c.id = e.campaign_id
              WHERE se.event_type IN ('completed','reward_unlocked','broken','missed')
              ORDER BY se.occurred_at DESC
              LIMIT $limit"
        );
        return ['activity' => $rows];
    }
}
