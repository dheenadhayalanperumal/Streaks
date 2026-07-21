<?php
declare(strict_types=1);

namespace Streaks\Core;

/**
 * Request-payload validation shared by every controller.
 *
 * The browser forms enforce the same rules (see frontend/lib/validation.ts),
 * but the API is the boundary that actually matters — clients can be bypassed,
 * and several endpoints write straight into fixed-width columns.
 *
 * Every method throws HttpException(422) with a message safe to show a user.
 */
final class Validate
{
    /** Display name for a person. */
    public const NAME_MAX = 30;

    /** Matches brand_profile.brand_name's column width so stored rows re-save. */
    public const BRAND_NAME_MAX = 120;

    /** Largest accepted image payload, in bytes of the stored string. */
    public const IMAGE_MAX = 768 * 1024;

    /**
     * Coerce a JSON value to a string, refusing the shapes that would silently
     * stringify to nonsense. Bodies come from json_decode, so `{"title":["x"]}`
     * is a reachable input and `(string) ["x"]` would store the literal "Array".
     */
    private static function scalar(mixed $value, string $field): string
    {
        if ($value === null) {
            return '';
        }
        if (is_bool($value) || !is_scalar($value)) {
            throw new HttpException(422, "$field must be a text value");
        }
        return trim((string) $value);
    }

    /** Non-empty, trimmed, length-capped string. */
    public static function requiredString(mixed $value, string $field, int $max): string
    {
        $v = self::scalar($value, $field);
        if ($v === '') {
            throw new HttpException(422, "$field is required");
        }
        if (mb_strlen($v) > $max) {
            throw new HttpException(422, "$field must be $max characters or fewer");
        }
        return $v;
    }

    /** Trimmed, length-capped string; blank and missing both collapse to null. */
    public static function optionalString(mixed $value, string $field, int $max): ?string
    {
        $v = self::scalar($value, $field);
        if ($v === '') {
            return null;
        }
        if (mb_strlen($v) > $max) {
            throw new HttpException(422, "$field must be $max characters or fewer");
        }
        return $v;
    }

    /**
     * A person's or brand's display name — letters plus the punctuation real
     * names contain, capped at 30 characters.
     */
    public static function personName(mixed $value, string $field = 'name'): string
    {
        $v = self::requiredString($value, $field, self::NAME_MAX);
        if (mb_strlen($v) < 2) {
            throw new HttpException(422, "$field must be at least 2 characters");
        }
        // \p{M} matters: in Indic scripts the vowel signs are combining marks,
        // so a name like "ரவி" is letters *and* marks. \x{200C}/\x{200D} are
        // ZWNJ/ZWJ, which Indic conjuncts legitimately contain. Without these we
        // would reject most Tamil, Hindi and Bengali names outright.
        if (!preg_match("/^\p{L}[\p{L}\p{M}\x{200C}\x{200D}\s.'-]*$/u", $v)) {
            throw new HttpException(422, "$field can only contain letters, spaces, apostrophes and hyphens");
        }
        return $v;
    }

    /**
     * A brand name is not a person's name: "7-Eleven", "Barnes & Noble" and
     * "Café 21" are all legitimate, so only length is constrained.
     */
    public static function brandName(mixed $value, string $field = 'brand_name'): string
    {
        return self::requiredString($value, $field, self::BRAND_NAME_MAX);
    }

    /** Same rules as personName, but the field may be absent entirely. */
    public static function optionalPersonName(mixed $value, string $field = 'name'): ?string
    {
        if ($value === null || trim((string) $value) === '') {
            return null;
        }
        return self::personName($value, $field);
    }

    /** Whole number inside an inclusive range; null passes when $nullable. */
    public static function int(mixed $value, string $field, int $min, int $max, bool $nullable = false): ?int
    {
        if ($value === null || $value === '') {
            if ($nullable) {
                return null;
            }
            throw new HttpException(422, "$field is required");
        }
        // Floats with a fractional part and out-of-range strings are rejected
        // rather than truncated/saturated by a bare (int) cast — the client
        // rejects them too, so accepting them here would silently mangle data.
        if (is_int($value)) {
            $n = $value;
        } elseif (is_float($value) && $value === floor($value) && abs($value) <= PHP_INT_MAX) {
            $n = (int) $value;
        } elseif (is_string($value) && preg_match('/^-?\d+$/', trim($value))) {
            $trimmed = trim($value);
            $n = (int) $trimmed;
            if ((string) $n !== ltrim($trimmed, '+')) {
                throw new HttpException(422, "$field is out of range");
            }
        } else {
            throw new HttpException(422, "$field must be a whole number");
        }
        if ($n < $min || $n > $max) {
            throw new HttpException(422, "$field must be between $min and $max");
        }
        return $n;
    }

    /** Decimal number inside an inclusive range; null passes when $nullable. */
    public static function float(mixed $value, string $field, float $min, float $max, bool $nullable = false): ?float
    {
        if ($value === null || $value === '') {
            if ($nullable) {
                return null;
            }
            throw new HttpException(422, "$field is required");
        }
        $value = is_string($value) ? trim($value) : $value;
        if (is_bool($value) || !is_numeric($value)) {
            throw new HttpException(422, "$field must be a number");
        }
        $n = (float) $value;
        if ($n < $min || $n > $max) {
            throw new HttpException(422, "$field must be between $min and $max");
        }
        return $n;
    }

    /** One of a fixed set of allowed values. */
    public static function enum(mixed $value, string $field, array $allowed, ?string $default = null): string
    {
        $v = $value === null || $value === '' ? $default : (string) $value;
        if ($v === null || !in_array($v, $allowed, true)) {
            throw new HttpException(422, "$field must be one of: " . implode(', ', $allowed));
        }
        return $v;
    }

    /** `YYYY-MM-DD` calendar date, or null. */
    public static function date(mixed $value, string $field): ?string
    {
        if ($value === null || trim((string) $value) === '') {
            return null;
        }
        $v = trim((string) $value);
        $d = \DateTimeImmutable::createFromFormat('!Y-m-d', $v);
        if ($d === false || $d->format('Y-m-d') !== $v) {
            throw new HttpException(422, "$field must be a valid date (YYYY-MM-DD)");
        }
        return $v;
    }

    /** IANA timezone identifier, e.g. `Asia/Kolkata`. */
    public static function timezone(mixed $value, string $field = 'timezone', string $default = 'UTC'): string
    {
        $v = trim((string) ($value ?? ''));
        if ($v === '') {
            return $default;
        }
        // Constructing the zone accepts the backward-compatibility aliases that
        // listIdentifiers() omits — `Asia/Calcutta`, `US/Eastern`, `GMT`. The
        // browser's Intl accepts them too, so anything else would reject values
        // the form said were fine, and lock existing campaigns out of editing.
        try {
            new \DateTimeZone($v);
        } catch (\Exception) {
            throw new HttpException(422, "$field must be a valid IANA timezone (e.g. Asia/Kolkata)");
        }
        return $v;
    }

    /** 6-digit hex colour, normalised to lowercase. */
    public static function hexColor(mixed $value, string $field, string $default): string
    {
        $v = trim((string) ($value ?? ''));
        if ($v === '') {
            return $default;
        }
        if (!preg_match('/^#[0-9a-fA-F]{6}$/', $v)) {
            throw new HttpException(422, "$field must be a 6-digit hex colour (e.g. $default)");
        }
        return strtolower($v);
    }

    /** Indian 10-digit mobile, with or without a +91 prefix. Returns the digits. */
    public static function mobile(mixed $value, string $field = 'mobile'): string
    {
        $digits = preg_replace('/\D/', '', self::scalar($value, $field)) ?? '';
        $digits = preg_replace('/^91(?=\d{10}$)/', '', $digits) ?? $digits;
        if (!preg_match('/^[6-9]\d{9}$/', $digits)) {
            throw new HttpException(422, "$field must be a valid 10-digit mobile number");
        }
        return $digits;
    }

    /**
     * Any international mobile, 8–15 digits.
     *
     * Opt-outs and test sends must not be India-only: `identifier` lets a
     * participant enrol with any country code, so restricting suppression to
     * +91 would leave a foreign number that asked to STOP with no way to be
     * added to the list.
     */
    public static function anyMobile(mixed $value, string $field = 'mobile'): string
    {
        $digits = preg_replace('/\D/', '', self::scalar($value, $field)) ?? '';
        if (!preg_match('/^\d{8,15}$/', $digits)) {
            throw new HttpException(422, "$field must be a valid mobile number");
        }
        return $digits;
    }

    /**
     * A participant identifier — an E.164-ish mobile (`+919876543210`) or an
     * email address. Anything else would create an unreachable account.
     */
    public static function identifier(mixed $value, string $field = 'identifier'): string
    {
        $v = trim((string) ($value ?? ''));
        if ($v === '') {
            throw new HttpException(422, "$field is required");
        }
        if (mb_strlen($v) > 190) {
            throw new HttpException(422, "$field must be 190 characters or fewer");
        }
        $isPhone = (bool) preg_match('/^\+?\d{8,15}$/', $v);
        $isEmail = filter_var($v, FILTER_VALIDATE_EMAIL) !== false;
        if (!$isPhone && !$isEmail) {
            throw new HttpException(422, "$field must be a mobile number or an email address");
        }
        return $v;
    }

    /**
     * An image reference: either an inline `data:image/…;base64,…` upload or an
     * http(s) URL. Anything else — `javascript:`, `data:text/html`, a bare path —
     * is rejected, because this value ends up in an `<img src>` on a public page.
     */
    public static function image(mixed $value, string $field = 'image'): ?string
    {
        if ($value === null || trim((string) $value) === '') {
            return null;
        }
        $v = trim((string) $value);

        if (str_starts_with($v, 'data:')) {
            // No SVG: every other format is re-encoded through a canvas before
            // upload, so a spoofed file cannot survive. SVG would reach the DB
            // byte-for-byte and is rendered on the public check-in page, which
            // is one markup change away from stored XSS.
            if (!preg_match('#^data:image/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=\s]+$#', $v)) {
                throw new HttpException(422, "$field must be a PNG, JPG, WebP or GIF upload");
            }
            if (strlen($v) > self::IMAGE_MAX) {
                throw new HttpException(422, "$field is too large — upload a smaller image");
            }
            return $v;
        }

        if (mb_strlen($v) > 500) {
            throw new HttpException(422, "$field URL must be 500 characters or fewer");
        }
        // Root-relative and protocol-relative paths predate the upload field and
        // are still valid references; anything else must be a well-formed
        // http(s) URL. Rejecting these would strand existing rows on re-save.
        if (str_starts_with($v, '//')) {
            return filter_var("https:$v", FILTER_VALIDATE_URL) !== false
                ? $v
                : throw new HttpException(422, "$field must be an uploaded image or an http(s) URL");
        }
        if (str_starts_with($v, '/')) {
            return $v;
        }
        $scheme = strtolower((string) parse_url($v, PHP_URL_SCHEME));
        if (!in_array($scheme, ['http', 'https'], true) || filter_var($v, FILTER_VALIDATE_URL) === false) {
            throw new HttpException(422, "$field must be an uploaded image or an http(s) URL");
        }
        return $v;
    }
}
