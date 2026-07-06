<?php
declare(strict_types=1);

namespace Streaks\Controllers;

use Streaks\Core\Auth;
use Streaks\Core\Database;
use Streaks\Core\HttpException;
use Streaks\Core\Request;
use Streaks\Services\StreakEngine;

final class ClientController
{
    /** GET /api/brand — public brand profile for the check-in page. */
    public function brand(): array
    {
        return ['brand' => \Streaks\Controllers\Admin\SettingsController::profile()];
    }

    /** GET /api/campaigns/active */
    public function activeCampaigns(): array
    {
        $rows = Database::all(
            'SELECT id, name, description, type, custom_period_days, missed_day_behaviour,
                    qualifying_action, timezone, start_date, end_date,
                    latitude, longitude, geofence_enabled
               FROM campaigns
              WHERE active = 1
                AND (start_date IS NULL OR start_date <= CURDATE())
                AND (end_date   IS NULL OR end_date   >= CURDATE())
              ORDER BY id DESC'
        );
        foreach ($rows as &$c) {
            $c['milestones'] = Database::all(
                'SELECT m.streak_count, r.title, r.type, r.value
                   FROM milestones m JOIN rewards r ON r.id = m.reward_id
                  WHERE m.campaign_id = ? ORDER BY m.streak_count',
                [$c['id']]
            );
        }
        return ['campaigns' => $rows];
    }

    /** POST /api/enroll  { identifier, name?, campaign_id } */
    public function enroll(Request $req): array
    {
        $user = Auth::resolveUser($req, create: true);
        $campaignId = (int) $req->input('campaign_id');

        $campaign = Database::one('SELECT * FROM campaigns WHERE id = ? AND active = 1', [$campaignId]);
        if ($campaign === null) {
            throw new HttpException(404, 'Active campaign not found');
        }

        $existing = Database::one('SELECT id FROM enrollments WHERE user_id = ? AND campaign_id = ?', [$user['id'], $campaignId]);
        if ($existing !== null) {
            $enrollmentId = (int) $existing['id'];
        } else {
            $enrollmentId = Database::insert(
                'INSERT INTO enrollments (user_id, campaign_id) VALUES (?, ?)',
                [$user['id'], $campaignId]
            );
            Database::insert('INSERT INTO streaks (enrollment_id, current_count) VALUES (?, 0)', [$enrollmentId]);
        }

        return ['enrollment_id' => $enrollmentId, 'user_id' => (int) $user['id'], 'campaign_id' => $campaignId];
    }

    /**
     * POST /api/action  { identifier|X-User-Id, campaign_id, idempotency_key? }
     * Reports a qualifying action; the server validates and advances the streak.
     */
    public function action(Request $req): array
    {
        $user = Auth::resolveUser($req, create: true);
        $campaignId = (int) $req->input('campaign_id');
        $lat = $req->input('latitude');
        $lng = $req->input('longitude');

        // Replay protection.
        $idem = $req->header('Idempotency-Key') ?? $req->input('idempotency_key');
        if ($idem) {
            try {
                Database::insert('INSERT INTO idempotency_keys (idem_key) VALUES (?)', [(string) $idem]);
            } catch (\PDOException) {
                throw new HttpException(409, 'Duplicate request (idempotency key already used)');
            }
        }

        $enrollment = Database::one(
            'SELECT id FROM enrollments WHERE user_id = ? AND campaign_id = ?',
            [$user['id'], $campaignId]
        );
        if ($enrollment === null) {
            // Auto-enroll on first action.
            $enrollmentId = Database::insert('INSERT INTO enrollments (user_id, campaign_id) VALUES (?, ?)', [$user['id'], $campaignId]);
        } else {
            $enrollmentId = (int) $enrollment['id'];
        }

        $result = StreakEngine::recordAction($enrollmentId, $lat ? (float) $lat : null, $lng ? (float) $lng : null);
        return ['ok' => true, 'user_id' => (int) $user['id']] + $result;
    }

    /** GET /api/me/streaks */
    public function myStreaks(Request $req): array
    {
        $user = Auth::resolveUser($req);
        $rows = Database::all(
            'SELECT e.campaign_id, c.name AS campaign_name, c.type,
                    s.current_count, s.longest_count, s.missed_count, s.status, s.last_completed_at
               FROM enrollments e
               JOIN campaigns c ON c.id = e.campaign_id
               LEFT JOIN streaks s ON s.enrollment_id = e.id
              WHERE e.user_id = ?
              ORDER BY e.id DESC',
            [$user['id']]
        );
        return ['user_id' => (int) $user['id'], 'streaks' => $rows];
    }

    /** GET /api/me/rewards */
    public function myRewards(Request $req): array
    {
        $user = Auth::resolveUser($req);
        $rows = Database::all(
            'SELECT ri.id, ri.code, ri.status, ri.issued_at, ri.expires_at,
                    r.title, r.description, r.type, r.value, r.image
               FROM reward_issues ri
               JOIN rewards r ON r.id = ri.reward_id
              WHERE ri.user_id = ?
              ORDER BY ri.issued_at DESC',
            [$user['id']]
        );
        return ['user_id' => (int) $user['id'], 'rewards' => $rows];
    }

    /** POST /api/rewards/:id/redeem */
    public function redeem(Request $req): array
    {
        $user = Auth::resolveUser($req);
        $id = (int) $req->params['id'];

        $issue = Database::one('SELECT * FROM reward_issues WHERE id = ? AND user_id = ?', [$id, $user['id']]);
        if ($issue === null) {
            throw new HttpException(404, 'Reward not found');
        }
        if ($issue['status'] === 'redeemed') {
            throw new HttpException(409, 'Reward already redeemed');
        }
        if ($issue['status'] === 'expired' || ($issue['expires_at'] !== null && strtotime($issue['expires_at']) < time())) {
            Database::exec('UPDATE reward_issues SET status = "expired" WHERE id = ?', [$id]);
            throw new HttpException(410, 'Reward has expired');
        }

        Database::exec('UPDATE reward_issues SET status = "redeemed", redeemed_at = NOW() WHERE id = ?', [$id]);
        return ['ok' => true, 'reward_issue_id' => $id, 'status' => 'redeemed'];
    }
}
