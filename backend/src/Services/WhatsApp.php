<?php
declare(strict_types=1);

namespace Streaks\Services;

/**
 * WhatsApp Business Cloud API client.
 *
 * Sends free-form text (in-window) and Meta-approved templates (out-of-window).
 * When no access token / phone-number id is configured it runs in SIMULATION
 * mode: the rendered message is logged to the server console and returned with
 * status "simulated", so the whole flow works in dev without real credentials.
 *
 * Return statuses: sent | simulated | failed | disabled | opted-out
 */
final class WhatsApp
{
    /** Human-readable body tokens -> variable keys. */
    private const TOKEN_MAP = [
        '[Name]'          => 'name',
        '[Business Name]' => 'business',
        '[Prize]'         => 'prize',
        '[CODE]'          => 'code',
        '[Days]'          => 'days',
    ];

    /** WhatsApp text body hard limit. */
    public const MAX_MESSAGE_LEN = 1024;

    /** Default Meta-approved template name (overridable per-client in settings). */
    public const DEFAULT_TEMPLATE_NAME = 'streak_reward';

    // ---- config -----------------------------------------------------------

    /** @return array<string,string> */
    private static function cfg(): array
    {
        return streaks_config()['whatsapp'];
    }

    /**
     * Live delivery is possible only when we have both a token and a phone id.
     * The phone id can come from per-client settings or the env default.
     *
     * @param array<string,mixed> $settings
     */
    public static function isLiveConfigured(array $settings): bool
    {
        $c = self::cfg();
        $phoneId = $settings['wa_phone_number_id'] ?? '' ?: $c['phone_number_id'];
        return $c['access_token'] !== '' && (string) $phoneId !== '';
    }

    // ---- rendering / normalization ----------------------------------------

    /**
     * Substitute [Bracket] tokens in a body with the given variables.
     *
     * @param array<string,mixed> $vars
     */
    public static function renderTemplate(?string $body, array $vars): string
    {
        $text = $body ?? '';
        foreach (self::TOKEN_MAP as $token => $key) {
            $text = str_replace($token, (string) ($vars[$key] ?? ''), $text);
        }
        return $text;
    }

    /** Normalize a phone number to E.164 (no +). 10-digit locals get the default cc. */
    public static function toE164(?string $mobile): string
    {
        $digits = preg_replace('/\D/', '', (string) $mobile) ?? '';
        if (strlen($digits) === 10) {
            return self::cfg()['default_country_code'] . $digits;
        }
        return $digits;
    }

    /** Opt-out key: last 10 digits, matching the webhook STOP normalization. */
    public static function optOutKey(?string $mobile): string
    {
        $digits = preg_replace('/\D/', '', (string) $mobile) ?? '';
        return substr($digits, -10);
    }

    /**
     * Ordered approved-template body params. Order MUST match {{1}}..{{n}}.
     *   {{1}} customer name   {{2}} reward / coupon code   {{3}} date
     *
     * @param array<string,mixed> $vars
     * @return array<int,array{type:string,text:string}>
     */
    public static function templateParams(array $vars): array
    {
        return array_map(
            fn($t) => ['type' => 'text', 'text' => (string) ($t ?? '')],
            [$vars['name'] ?? '', $vars['code'] ?? '', $vars['date'] ?? date('Y-m-d')]
        );
    }

    // ---- sending ----------------------------------------------------------

    /**
     * Send free-form text. Only deliverable inside the 24h customer-service
     * window; outside it Meta requires an approved template.
     *
     * @param array<string,mixed> $settings
     * @return array{status:string,text:string,error?:string}
     */
    public static function sendText(array $settings, ?string $mobile, string $text): array
    {
        if (empty($settings['wa_enabled'])) {
            return ['status' => 'disabled', 'text' => $text];
        }
        if (!self::isLiveConfigured($settings)) {
            error_log('[WhatsApp · SIMULATED -> +' . self::toE164($mobile) . '] ' . $text);
            return ['status' => 'simulated', 'text' => $text];
        }
        return self::post($settings, [
            'messaging_product' => 'whatsapp',
            'to'                => self::toE164($mobile),
            'type'              => 'text',
            'text'              => ['body' => $text],
        ], $text);
    }

    /**
     * Send a Meta-approved template (the out-of-window / reward path).
     *
     * @param array<string,mixed> $settings
     * @param array<string,mixed> $vars
     * @return array{status:string,text:string,error?:string}
     */
    public static function sendTemplate(array $settings, ?string $mobile, array $vars): array
    {
        $name = ($settings['wa_template_name'] ?? '') ?: self::DEFAULT_TEMPLATE_NAME;
        $summary = "[template:$name] " . implode(' | ', array_map(
            fn($p) => $p['text'],
            self::templateParams($vars)
        ));

        if (empty($settings['wa_enabled'])) {
            return ['status' => 'disabled', 'text' => $summary];
        }
        if (!self::isLiveConfigured($settings)) {
            error_log('[WhatsApp · SIMULATED -> +' . self::toE164($mobile) . '] ' . $summary);
            return ['status' => 'simulated', 'text' => $summary];
        }
        return self::post($settings, [
            'messaging_product' => 'whatsapp',
            'to'                => self::toE164($mobile),
            'type'              => 'template',
            'template'          => [
                'name'       => $name,
                'language'   => ['code' => self::cfg()['template_lang']],
                'components' => [['type' => 'body', 'parameters' => self::templateParams($vars)]],
            ],
        ], $summary);
    }

    /**
     * POST a payload to the Graph messages endpoint.
     *
     * @param array<string,mixed> $settings
     * @param array<string,mixed> $payload
     * @return array{status:string,text:string,error?:string}
     */
    private static function post(array $settings, array $payload, string $text): array
    {
        $c = self::cfg();
        $phoneId = ($settings['wa_phone_number_id'] ?? '') ?: $c['phone_number_id'];
        $url = "https://graph.facebook.com/{$c['api_version']}/{$phoneId}/messages";

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bearer ' . $c['access_token'],
                'Content-Type: application/json',
            ],
            CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);
        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);

        if ($body === false) {
            return ['status' => 'failed', 'text' => $text, 'error' => $curlErr ?: 'curl error'];
        }
        if ($status < 200 || $status >= 300) {
            return ['status' => 'failed', 'text' => $text, 'error' => "HTTP $status: $body"];
        }
        return ['status' => 'sent', 'text' => $text];
    }
}
