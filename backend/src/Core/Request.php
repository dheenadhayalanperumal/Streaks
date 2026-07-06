<?php
declare(strict_types=1);

namespace Streaks\Core;

final class Request
{
    public string $method;
    public string $path;
    /** @var array<string,string> */
    public array $query;
    /** @var array<string,mixed> */
    public array $body;
    /** @var array<string,string> path params (:id -> value) */
    public array $params = [];

    public static function capture(): self
    {
        $r = new self();
        $r->method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        $r->path   = rtrim(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/', '/') ?: '/';
        $r->query  = $_GET;

        $raw = file_get_contents('php://input') ?: '';
        $decoded = json_decode($raw, true);
        $r->body = is_array($decoded) ? $decoded : [];
        return $r;
    }

    public function header(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        return $_SERVER[$key] ?? null;
    }

    public function input(string $key, mixed $default = null): mixed
    {
        return $this->body[$key] ?? $this->query[$key] ?? $default;
    }
}
