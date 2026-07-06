<?php
declare(strict_types=1);

namespace Streaks\Core;

final class Router
{
    /** @var array<int,array{method:string,regex:string,keys:string[],handler:callable}> */
    private array $routes = [];

    public function add(string $method, string $pattern, callable $handler): void
    {
        // Convert "/api/campaigns/:id" -> regex with named-ish capture groups.
        $keys = [];
        $regex = preg_replace_callback('#:([a-zA-Z_]+)#', function ($m) use (&$keys) {
            $keys[] = $m[1];
            return '([^/]+)';
        }, $pattern);

        $this->routes[] = [
            'method'  => strtoupper($method),
            'regex'   => '#^' . $regex . '$#',
            'keys'    => $keys,
            'handler' => $handler,
        ];
    }

    public function get(string $p, callable $h): void    { $this->add('GET', $p, $h); }
    public function post(string $p, callable $h): void   { $this->add('POST', $p, $h); }
    public function put(string $p, callable $h): void    { $this->add('PUT', $p, $h); }
    public function patch(string $p, callable $h): void  { $this->add('PATCH', $p, $h); }
    public function delete(string $p, callable $h): void { $this->add('DELETE', $p, $h); }

    public function dispatch(Request $req): void
    {
        $pathMatched = false;

        foreach ($this->routes as $route) {
            if (!preg_match($route['regex'], $req->path, $m)) {
                continue;
            }
            $pathMatched = true;
            if ($route['method'] !== $req->method) {
                continue;
            }

            array_shift($m);
            foreach ($route['keys'] as $i => $key) {
                $req->params[$key] = $m[$i] ?? '';
            }

            try {
                $result = ($route['handler'])($req);
                if ($result !== null) {
                    Response::json($result);
                }
            } catch (HttpException $e) {
                Response::error($e->getMessage(), $e->status);
            } catch (\Throwable $e) {
                Response::error('Server error: ' . $e->getMessage(), 500);
            }
            return;
        }

        Response::error($pathMatched ? 'Method not allowed' : 'Not found', $pathMatched ? 405 : 404);
    }
}
