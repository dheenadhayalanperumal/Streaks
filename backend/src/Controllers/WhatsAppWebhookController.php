<?php
declare(strict_types=1);

namespace Streaks\Controllers;

use Streaks\Core\Database;
use Streaks\Core\Request;
use Streaks\Services\WhatsApp;

/**
 * Public, Meta-facing webhook.
 *   GET  — subscription verification handshake (echo hub.challenge).
 *   POST — inbound messages; records STOP / UNSUBSCRIBE as opt-outs.
 *
 * Both handlers respond directly and return null so the router does not also
 * emit a JSON body (the GET verify must return the raw challenge as text).
 */
final class WhatsAppWebhookController
{
    private const STOP_KEYWORDS = ['STOP', 'UNSUBSCRIBE', 'STOP PROMOTIONS'];

    /** GET /api/whatsapp/webhook */
    public function verify(Request $req): ?array
    {
        $verifyToken = streaks_config()['whatsapp']['verify_token'];
        if (($req->query['hub_mode'] ?? '') === 'subscribe'
            && ($req->query['hub_verify_token'] ?? '') === $verifyToken) {
            http_response_code(200);
            header('Content-Type: text/plain; charset=utf-8');
            echo (string) ($req->query['hub_challenge'] ?? '');
            exit;
        }
        http_response_code(403);
        exit;
    }

    /** POST /api/whatsapp/webhook */
    public function receive(Request $req): ?array
    {
        // Ack fast so Meta does not retry, then process.
        http_response_code(200);
        header('Content-Type: application/json; charset=utf-8');
        echo '{"ok":true}';
        if (function_exists('fastcgi_finish_request')) {
            fastcgi_finish_request();
        }

        $messages = $req->body['entry'][0]['changes'][0]['value']['messages'] ?? [];
        foreach ($messages as $m) {
            $text = strtoupper(trim((string) ($m['text']['body'] ?? '')));
            if (in_array($text, self::STOP_KEYWORDS, true)) {
                $key = WhatsApp::optOutKey((string) ($m['from'] ?? ''));
                if ($key !== '') {
                    Database::exec('INSERT IGNORE INTO wa_opt_outs (mobile) VALUES (?)', [$key]);
                }
            }
        }
        exit;
    }
}
