<?php
declare(strict_types=1);

namespace Streaks\Controllers\Admin;

use Streaks\Core\Database;
use Streaks\Core\HttpException;
use Streaks\Core\Request;
use Streaks\Core\Validate;

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

        // Validate the whole set before touching the table — a half-applied
        // milestone list would silently change what a live campaign pays out.
        $rows = [];
        foreach ($list as $i => $m) {
            $label = 'milestone ' . ((int) $i + 1);
            $count  = Validate::int($m['streak_count'] ?? null, "$label day", 1, 3650);
            $reward = Validate::int($m['reward_id'] ?? null, "$label reward_id", 1, 4294967295);
            if (isset($rows[$count])) {
                throw new HttpException(422, "two milestones share day $count — each day can unlock one reward");
            }
            if (Database::one('SELECT id FROM rewards WHERE id = ?', [$reward]) === null) {
                throw new HttpException(422, "$label points at a reward that no longer exists");
            }
            $rows[$count] = $reward;
        }

        $pdo = Database::pdo();
        $pdo->beginTransaction();
        try {
            Database::exec('DELETE FROM milestones WHERE campaign_id = ?', [$id]);
            foreach ($rows as $count => $reward) {
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
        $type = Validate::enum($req->input('type'), 'type', ['daily', 'weekly', 'monthly', 'custom'], 'daily');
        $custom = $type === 'custom'
            ? Validate::int($req->input('custom_period_days'), 'custom_period_days', 1, 3650)
            : null;

        $lat    = Validate::float($req->input('latitude'), 'latitude', -90, 90, true);
        $lng    = Validate::float($req->input('longitude'), 'longitude', -180, 180, true);
        // Floor of 1, not 10 — small indoor geofences were legal before this.
        $radius = Validate::int($req->input('geofence_radius_m'), 'geofence_radius_m', 1, 100000, true);

        $geoEnabled = (bool) $req->input('geofence_enabled', false);
        if ($geoEnabled && ($lat === null || $lng === null || $radius === null)) {
            throw new HttpException(422, 'latitude, longitude and geofence_radius_m are required when geofence is enabled');
        }

        $start = Validate::date($req->input('start_date'), 'start_date');
        $end   = Validate::date($req->input('end_date'), 'end_date');
        if ($start !== null && $end !== null && $end < $start) {
            throw new HttpException(422, 'end_date must be on or after start_date');
        }

        return [
            // Lengths mirror the column widths, not the UI's tighter guidance:
            // a row stored before this validator existed still has to re-save.
            'name'        => Validate::requiredString($req->input('name'), 'name', 190),
            'description' => Validate::optionalString($req->input('description'), 'description', 2000),
            'type'        => $type,
            'custom'      => $custom,
            'behaviour'   => Validate::enum($req->input('missed_day_behaviour'), 'missed_day_behaviour', ['break', 'no_break'], 'break'),
            'action'      => Validate::optionalString($req->input('qualifying_action'), 'qualifying_action', 120) ?? 'check_in',
            'tz'          => Validate::timezone($req->input('timezone')),
            'start'       => $start,
            'end'         => $end,
            'active'      => (int) (bool) $req->input('active', true),
            'lat'         => $lat,
            'lng'         => $lng,
            'radius'      => $radius,
            'geo_enabled' => (int) $geoEnabled,
        ];
    }

    private function withId(Request $req, int $id): Request
    {
        $req->params['id'] = (string) $id;
        return $req;
    }
}
