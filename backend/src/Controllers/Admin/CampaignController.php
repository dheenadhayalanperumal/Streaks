<?php
declare(strict_types=1);

namespace Streaks\Controllers\Admin;

use Streaks\Core\Database;
use Streaks\Core\HttpException;
use Streaks\Core\Request;

final class CampaignController
{
    /** GET /api/admin/campaigns */
    public function index(): array
    {
        $rows = Database::all(
            'SELECT c.*,
                    (SELECT COUNT(*) FROM enrollments e WHERE e.campaign_id = c.id) AS enrolled,
                    (SELECT COUNT(*) FROM milestones m WHERE m.campaign_id = c.id)  AS milestone_count
               FROM campaigns c ORDER BY c.id DESC'
        );
        return ['campaigns' => $rows];
    }

    /** GET /api/admin/campaigns/:id */
    public function show(Request $req): array
    {
        $c = Database::one('SELECT * FROM campaigns WHERE id = ?', [(int) $req->params['id']]);
        if ($c === null) {
            throw new HttpException(404, 'Campaign not found');
        }
        $c['milestones'] = Database::all(
            'SELECT m.id, m.streak_count, m.reward_id, r.title AS reward_title, r.type AS reward_type
               FROM milestones m JOIN rewards r ON r.id = m.reward_id
              WHERE m.campaign_id = ? ORDER BY m.streak_count',
            [$c['id']]
        );
        return ['campaign' => $c];
    }

    /** POST /api/admin/campaigns */
    public function create(Request $req): array
    {
        $data = $this->validate($req);
        $id = Database::insert(
            'INSERT INTO campaigns
                (name, description, type, custom_period_days, missed_day_behaviour,
                 qualifying_action, timezone, start_date, end_date, active,
                 latitude, longitude, geofence_radius_m, geofence_enabled)
             VALUES (:name,:description,:type,:custom,:behaviour,:action,:tz,:start,:end,:active,
                     :lat, :lng, :radius, :geo_enabled)',
            $data
        );
        return ['id' => $id] + $this->show($this->withId($req, $id));
    }

    /** PUT /api/admin/campaigns/:id */
    public function update(Request $req): array
    {
        $id = (int) $req->params['id'];
        if (Database::one('SELECT id FROM campaigns WHERE id = ?', [$id]) === null) {
            throw new HttpException(404, 'Campaign not found');
        }
        $data = $this->validate($req);
        $data['id'] = $id;
        Database::exec(
            'UPDATE campaigns SET
                name=:name, description=:description, type=:type, custom_period_days=:custom,
                missed_day_behaviour=:behaviour, qualifying_action=:action, timezone=:tz,
                start_date=:start, end_date=:end, active=:active,
                latitude=:lat, longitude=:lng, geofence_radius_m=:radius,
                geofence_enabled=:geo_enabled
             WHERE id=:id',
            $data
        );
        return $this->show($req);
    }

    /** DELETE /api/admin/campaigns/:id */
    public function destroy(Request $req): array
    {
        $id = (int) $req->params['id'];
        $n = Database::exec('DELETE FROM campaigns WHERE id = ?', [$id]);
        if ($n === 0) {
            throw new HttpException(404, 'Campaign not found');
        }
        return ['deleted' => $id];
    }

    /** GET /api/admin/campaigns/:id/milestones */
    public function milestones(Request $req): array
    {
        $id = (int) $req->params['id'];
        return ['milestones' => Database::all(
            'SELECT m.id, m.streak_count, m.reward_id, r.title AS reward_title
               FROM milestones m JOIN rewards r ON r.id = m.reward_id
              WHERE m.campaign_id = ? ORDER BY m.streak_count',
            [$id]
        )];
    }

    /** PUT /api/admin/campaigns/:id/milestones  { milestones: [{streak_count, reward_id}] } */
    public function replaceMilestones(Request $req): array
    {
        $id = (int) $req->params['id'];
        if (Database::one('SELECT id FROM campaigns WHERE id = ?', [$id]) === null) {
            throw new HttpException(404, 'Campaign not found');
        }
        $list = $req->input('milestones', []);
        if (!is_array($list)) {
            throw new HttpException(422, 'milestones must be an array');
        }

        $pdo = Database::pdo();
        $pdo->beginTransaction();
        try {
            Database::exec('DELETE FROM milestones WHERE campaign_id = ?', [$id]);
            foreach ($list as $m) {
                $count = (int) ($m['streak_count'] ?? 0);
                $reward = (int) ($m['reward_id'] ?? 0);
                if ($count < 1 || $reward < 1) {
                    continue;
                }
                Database::insert(
                    'INSERT INTO milestones (campaign_id, streak_count, reward_id) VALUES (?, ?, ?)',
                    [$id, $count, $reward]
                );
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        return $this->milestones($req);
    }

    private function validate(Request $req): array
    {
        $name = trim((string) $req->input('name'));
        if ($name === '') {
            throw new HttpException(422, 'name is required');
        }
        $type = $req->input('type', 'daily');
        if (!in_array($type, ['daily', 'weekly', 'monthly', 'custom'], true)) {
            throw new HttpException(422, 'invalid type');
        }
        $behaviour = $req->input('missed_day_behaviour', 'break');
        if (!in_array($behaviour, ['break', 'no_break'], true)) {
            throw new HttpException(422, 'invalid missed_day_behaviour');
        }
        $custom = $type === 'custom' ? (int) $req->input('custom_period_days', 1) : null;
        if ($type === 'custom' && $custom < 1) {
            throw new HttpException(422, 'custom_period_days must be >= 1 for custom campaigns');
        }
        $lat = $req->input('latitude');
        $lng = $req->input('longitude');
        $radius = $req->input('geofence_radius_m');
        // Use is_numeric (not truthiness) so a valid coordinate of exactly 0 is kept.
        $hasLat = $lat !== null && $lat !== '';
        $hasLng = $lng !== null && $lng !== '';
        $hasRadius = $radius !== null && $radius !== '';
        if ($hasLat && !is_numeric($lat)) {
            throw new HttpException(422, 'invalid latitude');
        }
        if ($hasLng && !is_numeric($lng)) {
            throw new HttpException(422, 'invalid longitude');
        }
        if ($hasRadius && (!is_numeric($radius) || (int) $radius < 1)) {
            throw new HttpException(422, 'invalid geofence_radius_m');
        }

        $geoEnabled = (bool) $req->input('geofence_enabled', false);
        if ($geoEnabled && !($hasLat && $hasLng && $hasRadius)) {
            throw new HttpException(422, 'latitude, longitude and geofence_radius_m are required when geofence is enabled');
        }

        return [
            'name'        => $name,
            'description' => $req->input('description'),
            'type'        => $type,
            'custom'      => $custom,
            'behaviour'   => $behaviour,
            'action'      => $req->input('qualifying_action', 'check_in'),
            'tz'          => $req->input('timezone', 'UTC'),
            'start'       => $req->input('start_date') ?: null,
            'end'         => $req->input('end_date') ?: null,
            'active'      => (int) (bool) $req->input('active', true),
            'lat'         => $hasLat ? (float) $lat : null,
            'lng'         => $hasLng ? (float) $lng : null,
            'radius'      => $hasRadius ? (int) $radius : null,
            'geo_enabled' => (int) $geoEnabled,
        ];
    }

    private function withId(Request $req, int $id): Request
    {
        $req->params['id'] = (string) $id;
        return $req;
    }
}
