<?php
declare(strict_types=1);

namespace Streaks\Core;

/** Thrown to short-circuit a handler with a specific HTTP status. */
final class HttpException extends \RuntimeException
{
    public function __construct(public int $status, string $message)
    {
        parent::__construct($message);
    }
}
