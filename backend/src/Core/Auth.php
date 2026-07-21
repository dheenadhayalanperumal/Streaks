<?php
declare(strict_types=1);

namespace Streaks\Core;

final class Auth
{
    /** Validate the admin bearer token; throws 401 if missing/invalid. */
    public static function requireAdmin(Request $req): array
    {
        $header = $req->header('Authorization') ?? '';
        if (!preg_match('/Bearer\s+(\S+)/i', $header, $m)) {
            throw new HttpException(401, 'Missing bearer token');
        }
        $token = $m[1];

        $row = Database::one(
            'SELECT s.token, s.expires_at, u.id, u.name, u.email, u.role
               FROM admin_sessions s
               JOIN admin_users u ON u.id = s.admin_user_id
              WHERE s.token = ? AND s.expires_at > NOW()',
            [$token]
        );

        if ($row === null) {
            throw new HttpException(401, 'Invalid or expired session');
        }
        return $row;
    }

    public static function login(string $email, string $password): array
    {
        $user = Database::one('SELECT * FROM admin_users WHERE email = ?', [$email]);
        if ($user === null || !password_verify($password, $user['password_hash'])) {
            throw new HttpException(401, 'Invalid credentials');
        }

        $token = bin2hex(random_bytes(32));
        Database::insert(
            'INSERT INTO admin_sessions (token, admin_user_id, expires_at)
             VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))',
            [$token, $user['id']]
        );

        return [
            'token' => $token,
            'user'  => ['id' => (int) $user['id'], 'name' => $user['name'], 'email' => $user['email'], 'role' => $user['role']],
        ];
    }

    /** Resolve (or create) a participant from an identifier for client endpoints. */
    public static function resolveUser(Request $req, bool $create = false): array
    {
        $id = $req->header('X-User-Id');
        if ($id !== null && ctype_digit($id)) {
            $u = Database::one('SELECT * FROM users WHERE id = ?', [(int) $id]);
            if ($u !== null) {
                return $u;
            }
        }

        $identifier = $req->header('X-User-Identifier') ?? $req->input('identifier');
        if ($identifier) {
            $identifier = Validate::identifier($identifier);
            $u = Database::one('SELECT * FROM users WHERE identifier = ?', [$identifier]);
            if ($u === null && $create) {
                $newId = Database::insert(
                    'INSERT INTO users (name, identifier) VALUES (?, ?)',
                    [Validate::optionalPersonName($req->input('name')), $identifier]
                );
                $u = Database::one('SELECT * FROM users WHERE id = ?', [$newId]);
            }
            if ($u !== null) {
                return $u;
            }
        }

        throw new HttpException(401, 'Unknown participant (send X-User-Id or identifier)');
    }
}
