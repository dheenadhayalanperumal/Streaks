<?php
declare(strict_types=1);

/**
 * Streaks API — single front controller.
 * Run locally with:  php -S localhost:8080 -t public public/index.php
 */

error_reporting(E_ALL & ~E_DEPRECATED);

require __DIR__ . '/../config/config.php';

// PSR-4-ish autoloader for the Streaks\ namespace.
spl_autoload_register(function (string $class): void {
    $prefix = 'Streaks\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }
    $rel = str_replace('\\', '/', substr($class, strlen($prefix)));
    $file = __DIR__ . '/../src/' . $rel . '.php';
    if (is_file($file)) {
        require $file;
    }
});

use Streaks\Core\Auth;
use Streaks\Core\Request;
use Streaks\Core\Response;
use Streaks\Core\Router;
use Streaks\Controllers\ClientController;
use Streaks\Controllers\WhatsAppWebhookController;
use Streaks\Controllers\Admin\AuthController;
use Streaks\Controllers\Admin\CampaignController;
use Streaks\Controllers\Admin\RewardController;
use Streaks\Controllers\Admin\UserController;
use Streaks\Controllers\Admin\StatsController;
use Streaks\Controllers\Admin\SettingsController;
use Streaks\Controllers\Admin\WhatsAppController;

// ---- CORS -----------------------------------------------------------------
$cfg = streaks_config();
header('Access-Control-Allow-Origin: ' . $cfg['cors_origin']);
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-User-Identifier, Idempotency-Key');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Vary: Origin');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$req = Request::capture();
$router = new Router();

$client   = new ClientController();
$auth     = new AuthController();
$campaign = new CampaignController();
$reward   = new RewardController();
$user     = new UserController();
$stats    = new StatsController();
$settings = new SettingsController();
$whatsapp = new WhatsAppController();
$waHook   = new WhatsAppWebhookController();

// Wrap an admin handler with auth enforcement.
$admin = fn(callable $h): callable => function (Request $r) use ($h) {
    Auth::requireAdmin($r);
    return $h($r);
};

// ---- Public / client ------------------------------------------------------
$router->get('/api/health', fn() => ['status' => 'ok', 'time' => date('c')]);
$router->get('/api/brand', fn($r) => $client->brand());
$router->get('/api/campaigns/active', fn($r) => $client->activeCampaigns());
$router->post('/api/enroll', fn($r) => $client->enroll($r));
$router->post('/api/action', fn($r) => $client->action($r));
$router->get('/api/me/streaks', fn($r) => $client->myStreaks($r));
$router->get('/api/me/rewards', fn($r) => $client->myRewards($r));
$router->post('/api/rewards/:id/redeem', fn($r) => $client->redeem($r));

// ---- Public: WhatsApp webhook (Meta -> us) --------------------------------
$router->get('/api/whatsapp/webhook', fn($r) => $waHook->verify($r));
$router->post('/api/whatsapp/webhook', fn($r) => $waHook->receive($r));

// ---- Admin auth -----------------------------------------------------------
$router->post('/api/admin/login', fn($r) => $auth->login($r));
$router->post('/api/admin/logout', fn($r) => $auth->logout($r));

// ---- Admin: campaigns -----------------------------------------------------
$router->get('/api/admin/campaigns', $admin(fn($r) => $campaign->index()));
$router->post('/api/admin/campaigns', $admin(fn($r) => $campaign->create($r)));
$router->get('/api/admin/campaigns/:id', $admin(fn($r) => $campaign->show($r)));
$router->put('/api/admin/campaigns/:id', $admin(fn($r) => $campaign->update($r)));
$router->delete('/api/admin/campaigns/:id', $admin(fn($r) => $campaign->destroy($r)));
$router->get('/api/admin/campaigns/:id/milestones', $admin(fn($r) => $campaign->milestones($r)));
$router->put('/api/admin/campaigns/:id/milestones', $admin(fn($r) => $campaign->replaceMilestones($r)));

// ---- Admin: rewards -------------------------------------------------------
$router->get('/api/admin/rewards', $admin(fn($r) => $reward->index()));
$router->post('/api/admin/rewards', $admin(fn($r) => $reward->create($r)));
$router->get('/api/admin/rewards/:id', $admin(fn($r) => $reward->show($r)));
$router->put('/api/admin/rewards/:id', $admin(fn($r) => $reward->update($r)));
$router->patch('/api/admin/rewards/:id/active', $admin(fn($r) => $reward->setActive($r)));
$router->delete('/api/admin/rewards/:id', $admin(fn($r) => $reward->destroy($r)));

// ---- Admin: users ---------------------------------------------------------
$router->get('/api/admin/users', $admin(fn($r) => $user->index($r)));
$router->get('/api/admin/users/:id', $admin(fn($r) => $user->show($r)));
$router->post('/api/admin/users/:id/adjust-streak', $admin(fn($r) => $user->adjustStreak($r)));

// ---- Admin: brand profile -------------------------------------------------
$router->get('/api/admin/brand', $admin(fn($r) => $settings->show()));
$router->put('/api/admin/brand', $admin(fn($r) => $settings->update($r)));

// ---- Admin: WhatsApp integration / templates / promotions -----------------
$router->get('/api/admin/whatsapp/status', $admin(fn($r) => $whatsapp->status()));
$router->get('/api/admin/whatsapp/settings', $admin(fn($r) => $whatsapp->showSettings()));
$router->put('/api/admin/whatsapp/settings', $admin(fn($r) => $whatsapp->updateSettings($r)));
$router->get('/api/admin/whatsapp/templates', $admin(fn($r) => $whatsapp->templates()));
$router->post('/api/admin/whatsapp/templates', $admin(fn($r) => $whatsapp->createTemplate($r)));
$router->put('/api/admin/whatsapp/templates/:id', $admin(fn($r) => $whatsapp->updateTemplate($r)));
$router->delete('/api/admin/whatsapp/templates/:id', $admin(fn($r) => $whatsapp->deleteTemplate($r)));
$router->get('/api/admin/whatsapp/optouts', $admin(fn($r) => $whatsapp->optOuts()));
$router->post('/api/admin/whatsapp/optouts', $admin(fn($r) => $whatsapp->addOptOut($r)));
$router->delete('/api/admin/whatsapp/optouts/:mobile', $admin(fn($r) => $whatsapp->removeOptOut($r)));
$router->get('/api/admin/whatsapp/recipients', $admin(fn($r) => $whatsapp->recipients($r)));
$router->post('/api/admin/whatsapp/broadcast', $admin(fn($r) => $whatsapp->broadcast($r)));
$router->post('/api/admin/whatsapp/test', $admin(fn($r) => $whatsapp->test($r)));

// ---- Admin: reward issues / stats / analytics / activity ------------------
$router->patch('/api/admin/reward-issues/:id', $admin(fn($r) => $auth->updateRewardIssue($r)));
$router->get('/api/admin/stats', $admin(fn($r) => $stats->stats()));
$router->get('/api/admin/analytics', $admin(fn($r) => $stats->analytics($r)));
$router->get('/api/admin/activity', $admin(fn($r) => $stats->activity($r)));

$router->dispatch($req);
