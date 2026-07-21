<?php
declare(strict_types=1);

namespace Streaks\Controllers\Admin;

use Streaks\Core\Database;
use Streaks\Core\HttpException;
use Streaks\Core\Request;
use Streaks\Core\Validate;
use Streaks\Services\WhatsApp;

/**
 * Admin surface for WhatsApp: delivery settings, the editable template library,
 * opt-outs, audience recipients and promotion broadcasts.
 */
final class WhatsAppController
{
    /** Audience segments (keep in sync with frontend lib/wa.ts). */
    private const SEGMENTS = ['all', 'redeemed', 'unused', 'non-redeemed'];

    // ---- delivery settings -------------------------------------------------

    /** GET /api/admin/whatsapp/status */
    public function status(): array
    {
        $s = self::settings();
        $enabled = (bool) $s['wa_enabled'];
        $live = WhatsApp::isLiveConfigured($s);
        return [
            'enabled' => $enabled,
            'live'    => $live,
            'mode'    => $live ? 'live' : 'simulation',
        ];
    }

    /** GET /api/admin/whatsapp/settings */
    public function showSettings(): array
    {
        $s = self::settings();
        $live = WhatsApp::isLiveConfigured($s);
        return [
            'settings' => [
                'wa_enabled'         => (bool) $s['wa_enabled'],
                'wa_phone_number_id' => $s['wa_phone_number_id'],
                'wa_template_name'   => $s['wa_template_name'],
                'wa_template_body'   => $s['wa_template_body'],
            ],
            'mode'       => $live ? 'live' : 'simulation',
            'brand_name' => self::brandName(),
        ];
    }

    /** PUT /api/admin/whatsapp/settings */
    public function updateSettings(Request $req): array
    {
        $name = trim((string) $req->input('wa_template_name', WhatsApp::DEFAULT_TEMPLATE_NAME));
        $name = $name === '' ? WhatsApp::DEFAULT_TEMPLATE_NAME : self::normalizeName($name);

        $phoneId = Validate::optionalString($req->input('wa_phone_number_id'), 'wa_phone_number_id', 40);
        if ($phoneId !== null && !preg_match('/^\d+$/', $phoneId)) {
            throw new HttpException(422, 'wa_phone_number_id must contain digits only');
        }

        $body = $req->input('wa_template_body');
        $body = ($body === null || trim((string) $body) === '') ? null : (string) $body;
        if ($body !== null && mb_strlen($body) > WhatsApp::MAX_MESSAGE_LEN) {
            throw new HttpException(422, 'Template body exceeds ' . WhatsApp::MAX_MESSAGE_LEN . ' characters');
        }

        Database::exec(
            'UPDATE wa_settings
                SET wa_enabled = :enabled, wa_phone_number_id = :phone,
                    wa_template_name = :name, wa_template_body = :body
              WHERE id = 1',
            [
                'enabled' => (int) (bool) $req->input('wa_enabled', false),
                'phone'   => $phoneId,
                'name'    => $name,
                'body'    => $body,
            ]
        );
        return $this->showSettings();
    }

    // ---- template library --------------------------------------------------

    /** GET /api/admin/whatsapp/templates */
    public function templates(): array
    {
        return ['templates' => Database::all('SELECT * FROM wa_templates ORDER BY name ASC')];
    }

    /** POST /api/admin/whatsapp/templates */
    public function createTemplate(Request $req): array
    {
        [$name, $body] = $this->validateTemplate($req);
        if (Database::one('SELECT id FROM wa_templates WHERE name = ?', [$name]) !== null) {
            throw new HttpException(422, "A template named '$name' already exists");
        }
        $id = Database::insert(
            'INSERT INTO wa_templates (name, body) VALUES (:name, :body)',
            ['name' => $name, 'body' => $body]
        );
        return ['template' => Database::one('SELECT * FROM wa_templates WHERE id = ?', [$id])];
    }

    /** PUT /api/admin/whatsapp/templates/:id */
    public function updateTemplate(Request $req): array
    {
        $id = (int) $req->params['id'];
        if (Database::one('SELECT id FROM wa_templates WHERE id = ?', [$id]) === null) {
            throw new HttpException(404, 'Template not found');
        }
        [$name, $body] = $this->validateTemplate($req);
        $clash = Database::one('SELECT id FROM wa_templates WHERE name = ? AND id <> ?', [$name, $id]);
        if ($clash !== null) {
            throw new HttpException(422, "A template named '$name' already exists");
        }
        Database::exec(
            'UPDATE wa_templates SET name = :name, body = :body WHERE id = :id',
            ['name' => $name, 'body' => $body, 'id' => $id]
        );
        return ['template' => Database::one('SELECT * FROM wa_templates WHERE id = ?', [$id])];
    }

    /** DELETE /api/admin/whatsapp/templates/:id */
    public function deleteTemplate(Request $req): array
    {
        $id = (int) $req->params['id'];
        if (Database::exec('DELETE FROM wa_templates WHERE id = ?', [$id]) === 0) {
            throw new HttpException(404, 'Template not found');
        }
        return ['deleted' => $id];
    }

    // ---- opt-outs ----------------------------------------------------------

    /** GET /api/admin/whatsapp/optouts */
    public function optOuts(): array
    {
        return ['optouts' => Database::all('SELECT * FROM wa_opt_outs ORDER BY created_at DESC')];
    }

    /** POST /api/admin/whatsapp/optouts  { mobile } */
    public function addOptOut(Request $req): array
    {
        $key = WhatsApp::optOutKey(Validate::anyMobile($req->input('mobile')));
        if ($key === '') {
            throw new HttpException(422, 'A valid mobile number is required');
        }
        Database::exec('INSERT IGNORE INTO wa_opt_outs (mobile) VALUES (?)', [$key]);
        return ['mobile' => $key];
    }

    /** DELETE /api/admin/whatsapp/optouts/:mobile */
    public function removeOptOut(Request $req): array
    {
        $key = WhatsApp::optOutKey((string) $req->params['mobile']);
        Database::exec('DELETE FROM wa_opt_outs WHERE mobile = ?', [$key]);
        return ['released' => $key];
    }

    // ---- recipients & broadcast -------------------------------------------

    /** GET /api/admin/whatsapp/recipients?segment= */
    public function recipients(Request $req): array
    {
        $segment = (string) ($req->query['segment'] ?? 'all');
        $recipients = $this->resolveRecipients($segment);
        return ['segment' => $segment, 'count' => count($recipients), 'recipients' => $recipients];
    }

    /** POST /api/admin/whatsapp/broadcast  { segment, message } */
    public function broadcast(Request $req): array
    {
        $s = self::settings();
        if (empty($s['wa_enabled'])) {
            throw new HttpException(400, 'WhatsApp delivery is disabled. Enable it in Settings first.');
        }
        $segment = (string) $req->input('segment', 'all');
        $message = trim((string) $req->input('message'));
        if ($message === '') {
            throw new HttpException(422, 'A message body is required');
        }
        if (mb_strlen($message) > WhatsApp::MAX_MESSAGE_LEN) {
            throw new HttpException(422, 'Message exceeds ' . WhatsApp::MAX_MESSAGE_LEN . ' characters');
        }

        $business = self::brandName();
        $recipients = $this->resolveRecipients($segment);
        $tally = ['total' => count($recipients), 'sent' => 0, 'simulated' => 0, 'failed' => 0, 'skipped' => 0];

        foreach ($recipients as $r) {
            $text = WhatsApp::renderTemplate($message, [
                'name'     => $r['name'] ?: 'there',
                'business' => $business,
                'code'     => $r['code'] ?? '',
                'prize'    => '',
                'days'     => '',
            ]);
            $res = WhatsApp::sendText($s, $r['mobile'], $text);
            switch ($res['status']) {
                case 'sent':       $tally['sent']++; break;
                case 'simulated':  $tally['simulated']++; break;
                case 'failed':     $tally['failed']++; break;
                default:           $tally['skipped']++;   // disabled / opted-out
            }
        }
        return ['segment' => $segment, 'result' => $tally];
    }

    /** POST /api/admin/whatsapp/test  { mobile, name } */
    public function test(Request $req): array
    {
        $s = self::settings();
        $mobile = Validate::anyMobile($req->input('mobile'));
        if (in_array(WhatsApp::optOutKey($mobile), self::optOutSet(), true)) {
            return ['result' => ['status' => 'opted-out', 'text' => '']];
        }

        $name = Validate::optionalPersonName($req->input('name')) ?? 'there';
        $business = self::brandName();
        $vars = [
            'name'     => $name,
            'business' => $business,
            'prize'    => 'a surprise reward',
            'code'     => 'STREAK-' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 5)),
            'days'     => '14',
            'date'     => date('Y-m-d'),
        ];

        // Prefer the library template chosen as the reward; fall back to the body.
        $tpl = Database::one('SELECT body FROM wa_templates WHERE name = ?', [$s['wa_template_name']]);
        $body = $tpl['body'] ?? ($s['wa_template_body'] ?? null);
        $text = WhatsApp::renderTemplate($body, $vars);
        $res = $body !== null
            ? WhatsApp::sendText($s, $mobile, $text)
            : WhatsApp::sendTemplate($s, $mobile, $vars);   // no library body -> approved template

        return ['result' => $res];
    }

    // ---- helpers -----------------------------------------------------------

    /**
     * Resolve the recipient list for a segment. Groups participants, drops
     * opted-out numbers, and attaches a representative reward code so [CODE]
     * can be filled per recipient.
     *
     * @return array<int,array{id:int,name:string,mobile:string,code:?string}>
     */
    private function resolveRecipients(string $segment): array
    {
        if (!in_array($segment, self::SEGMENTS, true)) {
            $segment = 'all';
        }

        $where = match ($segment) {
            'redeemed'     => 'WHERE EXISTS (SELECT 1 FROM reward_issues ri WHERE ri.user_id = u.id AND ri.status = "redeemed")',
            'non-redeemed' => 'WHERE NOT EXISTS (SELECT 1 FROM reward_issues ri WHERE ri.user_id = u.id AND ri.status = "redeemed")',
            'unused'       => 'WHERE EXISTS (SELECT 1 FROM reward_issues ri WHERE ri.user_id = u.id AND ri.status = "unlocked"
                                             AND (ri.expires_at IS NULL OR ri.expires_at > NOW()))',
            default        => '',
        };

        // A representative code: a live unlocked code if any, else the latest issued.
        $rows = Database::all(
            "SELECT u.id, u.name, u.identifier,
                    COALESCE(
                      (SELECT ri.code FROM reward_issues ri
                        WHERE ri.user_id = u.id AND ri.status = 'unlocked'
                          AND (ri.expires_at IS NULL OR ri.expires_at > NOW())
                        ORDER BY ri.issued_at DESC LIMIT 1),
                      (SELECT ri.code FROM reward_issues ri
                        WHERE ri.user_id = u.id ORDER BY ri.issued_at DESC LIMIT 1)
                    ) AS code
               FROM users u
               $where
              ORDER BY u.id DESC
              LIMIT 1000"
        );

        $optedOut = self::optOutSet();
        $out = [];
        foreach ($rows as $r) {
            $key = WhatsApp::optOutKey($r['identifier']);
            if ($key !== '' && in_array($key, $optedOut, true)) {
                continue;   // compliance: never message a STOPped number
            }
            $out[] = [
                'id'     => (int) $r['id'],
                'name'   => (string) ($r['name'] ?? ''),
                'mobile' => (string) $r['identifier'],
                'code'   => $r['code'] ?? null,
            ];
        }
        return $out;
    }

    /** @return string[] normalized opted-out keys */
    private static function optOutSet(): array
    {
        return array_column(Database::all('SELECT mobile FROM wa_opt_outs'), 'mobile');
    }

    /** @return array{name:string,body:string} */
    private function validateTemplate(Request $req): array
    {
        $name = self::normalizeName((string) $req->input('name'));
        if ($name === '') {
            throw new HttpException(422, 'A template name is required');
        }
        $body = trim((string) $req->input('body'));
        if ($body === '') {
            throw new HttpException(422, 'A template body is required');
        }
        if (mb_strlen($body) > WhatsApp::MAX_MESSAGE_LEN) {
            throw new HttpException(422, 'Body exceeds ' . WhatsApp::MAX_MESSAGE_LEN . ' characters');
        }
        return [$name, $body];
    }

    /** Normalize a template name: trim, spaces -> _, lowercase, cap length. */
    private static function normalizeName(string $name): string
    {
        $n = strtolower(trim($name));
        $n = (string) preg_replace('/\s+/', '_', $n);
        return substr($n, 0, 80);
    }

    /** Fetch the WhatsApp settings row, self-healing the seed row if missing. */
    private static function settings(): array
    {
        $row = Database::one('SELECT * FROM wa_settings WHERE id = 1');
        if ($row === null) {
            Database::exec(
                "INSERT INTO wa_settings (id, wa_enabled, wa_template_name)
                 VALUES (1, 0, '" . WhatsApp::DEFAULT_TEMPLATE_NAME . "')"
            );
            $row = Database::one('SELECT * FROM wa_settings WHERE id = 1');
        }
        return $row ?? [];
    }

    private static function brandName(): string
    {
        $row = Database::one('SELECT brand_name FROM brand_profile WHERE id = 1');
        return (string) ($row['brand_name'] ?? 'our store');
    }
}
