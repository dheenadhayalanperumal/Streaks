<?php
declare(strict_types=1);

namespace Streaks\Controllers\Admin;

use Streaks\Core\Database;
use Streaks\Core\Request;
use Streaks\Core\Validate;

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
        return [
            'brand_name'  => Validate::brandName($req->input('brand_name')),
            'tagline'     => Validate::optionalString($req->input('tagline'), 'tagline', 120),
            'logo'        => Validate::image($req->input('logo'), 'logo'),
            'theme_color' => Validate::hexColor($req->input('theme_color'), 'theme_color', '#ef5a7f'),
        ];
    }
}
