<?php
declare(strict_types=1);

namespace Streaks\Controllers\Admin;

use Streaks\Core\Database;
use Streaks\Core\HttpException;
use Streaks\Core\Request;

/**
 * Brand profile settings — a single editable row (id = 1) that drives the
 * branding shown on the customer check-in page (name, tagline, logo, theme).
 */
final class SettingsController
{
    /** GET /api/admin/brand */
    public function show(): array
    {
        return ['brand' => self::profile()];
    }

    /** PUT /api/admin/brand */
    public function update(Request $req): array
    {
        $d = $this->validate($req);
        Database::exec(
            'UPDATE brand_profile
                SET brand_name = :brand_name, tagline = :tagline,
                    logo = :logo, theme_color = :theme_color
              WHERE id = 1',
            $d
        );
        return ['brand' => self::profile()];
    }

    /** Fetch the profile, self-healing the seed row if it is missing. */
    public static function profile(): array
    {
        $row = Database::one('SELECT * FROM brand_profile WHERE id = 1');
        if ($row === null) {
            Database::exec(
                "INSERT INTO brand_profile (id, brand_name, theme_color)
                 VALUES (1, 'Streaks', '#ef5a7f')"
            );
            $row = Database::one('SELECT * FROM brand_profile WHERE id = 1');
        }
        return $row ?? [];
    }

    private function validate(Request $req): array
    {
        $name = trim((string) $req->input('brand_name'));
        if ($name === '') {
            throw new HttpException(422, 'brand_name is required');
        }

        $color = trim((string) $req->input('theme_color', '#ef5a7f'));
        if (!preg_match('/^#[0-9a-fA-F]{6}$/', $color)) {
            throw new HttpException(422, 'theme_color must be a 6-digit hex color (e.g. #ef5a7f)');
        }

        $logo = $req->input('logo');
        $logo = ($logo === null || trim((string) $logo) === '') ? null : (string) $logo;

        $tagline = $req->input('tagline');
        $tagline = ($tagline === null || trim((string) $tagline) === '') ? null : trim((string) $tagline);

        return [
            'brand_name'  => $name,
            'tagline'     => $tagline,
            'logo'        => $logo,
            'theme_color' => strtolower($color),
        ];
    }
}
