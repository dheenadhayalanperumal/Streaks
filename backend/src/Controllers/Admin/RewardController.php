<?php
declare(strict_types=1);

namespace Streaks\Controllers\Admin;

use Streaks\Core\Database;
use Streaks\Core\HttpException;
use Streaks\Core\Request;

final class RewardController
{
    /** GET /api/admin/rewards */
    public function index(): array
    {
        return ['rewards' => Database::all(
            'SELECT r.*,
                    (SELECT COUNT(*) FROM reward_issues ri WHERE ri.reward_id = r.id) AS issued,
                    (SELECT COUNT(*) FROM reward_issues ri WHERE ri.reward_id = r.id AND ri.status = "redeemed") AS redeemed
               FROM rewards r ORDER BY r.id DESC'
        )];
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
        $title = trim((string) $req->input('title'));
        if ($title === '') {
            throw new HttpException(422, 'title is required');
        }
        $type = $req->input('type', 'coupon');
        if (!in_array($type, ['coupon', 'points', 'badge', 'custom'], true)) {
            throw new HttpException(422, 'invalid reward type');
        }
        return [
            'title'       => $title,
            'description' => $req->input('description'),
            'type'        => $type,
            'value'       => $req->input('value'),
            'image'       => $req->input('image'),
            'validity'    => $req->input('validity_days') !== null ? (int) $req->input('validity_days') : null,
            'active'      => (int) (bool) $req->input('active', true),
        ];
    }
}
