<?php
declare(strict_types=1);

namespace Streaks\Controllers\Admin;

use Streaks\Core\Auth;
use Streaks\Core\Database;
use Streaks\Core\HttpException;
use Streaks\Core\Request;

final class AuthController
{
    /** POST /api/admin/login  { email, password } */
    public function login(Request $req): array
    {
        $email = trim((string) $req->input('email'));
        $password = (string) $req->input('password');
        if ($email === '' || $password === '') {
            throw new HttpException(422, 'email and password are required');
        }
        // Only a length bound here. A stricter format check would reject
        // legitimate stored accounts such as `admin@localhost`, and it would
        // also return before password_verify() runs — a timing signal that
        // distinguishes addresses regardless of the status code.
        if (mb_strlen($email) > 190) {
            throw new HttpException(401, 'Invalid credentials');
        }
        return Auth::login($email, $password);
    }

    /** POST /api/admin/logout */
    public function logout(Request $req): array
    {
        $header = $req->header('Authorization') ?? '';
        if (preg_match('/Bearer\s+(\S+)/i', $header, $m)) {
            Database::exec('DELETE FROM admin_sessions WHERE token = ?', [$m[1]]);
        }
        return ['ok' => true];
    }

    /** GET /api/admin/reward-issues status update is here for convenience. */
    public function updateRewardIssue(Request $req): array
    {
        $id = (int) $req->params['id'];
        $status = $req->input('status');
        if (!in_array($status, ['unlocked', 'redeemed', 'expired'], true)) {
            throw new HttpException(422, 'invalid status');
        }
        $issue = Database::one('SELECT id FROM reward_issues WHERE id = ?', [$id]);
        if ($issue === null) {
            throw new HttpException(404, 'Reward issue not found');
        }
        $redeemedAt = $status === 'redeemed' ? 'NOW()' : 'redeemed_at';
        Database::exec("UPDATE reward_issues SET status = ?, redeemed_at = $redeemedAt WHERE id = ?", [$status, $id]);
        return ['ok' => true, 'id' => $id, 'status' => $status];
    }
}
