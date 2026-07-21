<?php
declare(strict_types=1);

namespace Streaks\Controllers\Admin;

use Streaks\Core\Database;
use Streaks\Core\HttpException;
use Streaks\Core\Request;
use Streaks\Core\Validate;

final class RewardController
{
    /** GET /api/admin/rewards */
    public function index(): array
    {
        // `image` is a LONGTEXT data: URI since uploads replaced URLs — listing
        // it would put a few hundred KB per row on the wire, and this endpoint
        // also backs the campaign page's milestone picker, which needs only the
        // title. A thumbnail flag lets the card show a placeholder; the full
        // image is fetched with the row when editing.
        return ['rewards' => Database::all(
            'SELECT r.id, r.title, r.description, r.type, r.value, r.validity_days,
                    r.active, r.created_at, r.updated_at,
                    (r.image IS NOT NULL AND r.image <> "") AS has_image,
                    (SELECT COUNT(*) FROM reward_issues ri WHERE ri.reward_id = r.id) AS issued,
                    (SELECT COUNT(*) FROM reward_issues ri WHERE ri.reward_id = r.id AND ri.status = "redeemed") AS redeemed
               FROM rewards r ORDER BY r.id DESC'
        )];
    }

    /** GET /api/admin/rewards/:id — the full row, including the image. */
    public function show(Request $req): array
    {
        $r = Database::one('SELECT * FROM rewards WHERE id = ?', [(int) $req->params['id']]);
        if ($r === null) {
            throw new HttpException(404, 'Reward not found');
        }
        return ['reward' => $r];
    }

    /**
     * PATCH /api/admin/rewards/:id/active — flip the enabled flag alone.
     *
     * Enable/Disable used to round-trip the whole row through validate(), so a
     * reward stored under older rules could not be toggled at all. Nothing but
     * `active` is read here, so the operation cannot fail on unrelated fields.
     */
    public function setActive(Request $req): array
    {
        $id = (int) $req->params['id'];
        $active = (int) (bool) $req->input('active', true);
        if (Database::exec('UPDATE rewards SET active = ? WHERE id = ?', [$active, $id]) === 0
            && Database::one('SELECT id FROM rewards WHERE id = ?', [$id]) === null) {
            throw new HttpException(404, 'Reward not found');
        }
        return ['id' => $id, 'active' => $active];
    }

    /** POST /api/admin/rewards */
    public function create(Request $req): array
    {
        $d = $this->validate($req);
        $id = Database::insert(
            'INSERT INTO rewards (title, description, type, value, image, validity_days, active)
             VALUES (:title,:description,:type,:value,:image,:validity,:active)',
            $d
        );
        return ['reward' => Database::one('SELECT * FROM rewards WHERE id = ?', [$id])];
    }

    /** PUT /api/admin/rewards/:id */
    public function update(Request $req): array
    {
        $id = (int) $req->params['id'];
        if (Database::one('SELECT id FROM rewards WHERE id = ?', [$id]) === null) {
            throw new HttpException(404, 'Reward not found');
        }
        $d = $this->validate($req);
        $d['id'] = $id;
        Database::exec(
            'UPDATE rewards SET title=:title, description=:description, type=:type, value=:value,
                    image=:image, validity_days=:validity, active=:active WHERE id=:id',
            $d
        );
        return ['reward' => Database::one('SELECT * FROM rewards WHERE id = ?', [$id])];
    }

    /** DELETE /api/admin/rewards/:id */
    public function destroy(Request $req): array
    {
        $id = (int) $req->params['id'];
        $n = Database::exec('DELETE FROM rewards WHERE id = ?', [$id]);
        if ($n === 0) {
            throw new HttpException(404, 'Reward not found');
        }
        return ['deleted' => $id];
    }

    private function validate(Request $req): array
    {
        return [
            // Lengths mirror the column widths, not the UI's tighter guidance:
            // a row stored before this validator existed still has to re-save.
            'title'       => Validate::requiredString($req->input('title'), 'title', 190),
            'description' => Validate::optionalString($req->input('description'), 'description', 2000),
            'type'        => Validate::enum($req->input('type'), 'type', ['coupon', 'points', 'badge', 'custom'], 'coupon'),
            'value'       => Validate::optionalString($req->input('value'), 'value', 120),
            'image'       => Validate::image($req->input('image')),
            'validity'    => Validate::int($req->input('validity_days'), 'validity_days', 0, 3650, true),
            'active'      => (int) (bool) $req->input('active', true),
        ];
    }
}
