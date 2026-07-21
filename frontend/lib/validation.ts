/**
 * Shared input rules for the admin console and the customer check-in page.
 *
 * Every validator returns an error string, or `null` when the value is fine —
 * so a form can build its error map with a plain object literal and feed it to
 * `firstError` / the `Field` component.
 */

/** Maximum accepted length per field, mirrored by the API and the DB columns. */
export const LIMITS = {
  name: 30, // person's display name
  brandName: 120,      // matches brand_profile.brand_name
  campaignName: 190,   // matches campaigns.name
  title: 190,          // matches rewards.title
  description: 2000,   // TEXT column; the API allows the same
  tagline: 120,
  value: 120,          // matches rewards.value
  templateName: 60,
  templateBody: 1024,
  timezone: 64,
  qualifyingAction: 120,
  phoneNumberId: 40,
  /** Uploaded images are downscaled before this ceiling is applied. */
  imageBytes: 512 * 1024,
} as const;

export type Errors = Record<string, string | null>;

/** First non-empty message in the map, or "" when the form is clean. */
export function firstError(errors: Errors): string {
  for (const key of Object.keys(errors)) {
    const msg = errors[key];
    if (msg) return msg;
  }
  return "";
}

export function hasErrors(errors: Errors): boolean {
  return firstError(errors) !== "";
}

// ---------------------------------------------------------------- generic ---

export function required(label: string, value: string): string | null {
  return value.trim() === "" ? `${label} is required.` : null;
}

export function maxLen(label: string, value: string, max: number): string | null {
  return value.trim().length > max ? `${label} must be ${max} characters or fewer.` : null;
}

export function minLen(label: string, value: string, min: number): string | null {
  return value.trim().length < min ? `${label} must be at least ${min} characters.` : null;
}

/**
 * Whole number inside an inclusive range. `allowBlank` lets an optional numeric
 * field stay empty (the caller stores `null` for it).
 */
export function intRange(
  label: string,
  value: string,
  min: number,
  max: number,
  allowBlank = false,
): string | null {
  const raw = value.trim();
  if (raw === "") return allowBlank ? null : `${label} is required.`;
  if (!/^-?\d+$/.test(raw)) return `${label} must be a whole number.`;
  const n = Number(raw);
  if (n < min || n > max) return `${label} must be between ${min} and ${max}.`;
  return null;
}

/** Decimal number inside an inclusive range (latitude, longitude, …). */
export function numRange(
  label: string,
  value: string,
  min: number,
  max: number,
  allowBlank = false,
): string | null {
  const raw = value.trim();
  if (raw === "") return allowBlank ? null : `${label} is required.`;
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return `${label} must be a number.`;
  const n = Number(raw);
  if (n < min || n > max) return `${label} must be between ${min} and ${max}.`;
  return null;
}

/**
 * Range checks for values that are already numbers.
 *
 * The string variants above exist for text inputs; routing a real number
 * through them means `String(1e-7)` → `"1e-7"`, which no decimal regex matches
 * — a latitude of 0.0000001 would be reported as "not a number".
 */
export function numValue(
  label: string,
  value: number | null,
  min: number,
  max: number,
  allowBlank = false,
): string | null {
  if (value == null) return allowBlank ? null : `${label} is required.`;
  if (!Number.isFinite(value)) return `${label} must be a number.`;
  if (value < min || value > max) return `${label} must be between ${min} and ${max}.`;
  return null;
}

/** As `numValue`, but the column behind it only stores whole numbers. */
export function intValue(
  label: string,
  value: number | null,
  min: number,
  max: number,
  allowBlank = false,
): string | null {
  const bad = numValue(label, value, min, max, allowBlank);
  if (bad) return bad;
  if (value != null && !Number.isInteger(value)) return `${label} must be a whole number.`;
  return null;
}

// ------------------------------------------------------------- specific ---

/**
 * A person's display name: letters, spaces and the punctuation that shows up in
 * real names, capped at 30 characters. Brand names use `brandName` instead.
 */
export function personName(value: string, label = "Name"): string | null {
  const v = value.trim();
  if (v === "") return `${label} is required.`;
  if (v.length < 2) return `${label} must be at least 2 characters.`;
  if (v.length > LIMITS.name) return `${label} must be ${LIMITS.name} characters or fewer.`;
  // \p{M} matters: in Indic scripts the vowel signs are combining marks, so a
  // name like "ரவி" is letters *and* marks. Without it we would reject most
  // Tamil, Hindi and Bengali names outright.
  // \u200c/\u200d are ZWNJ/ZWJ, which Indic conjuncts legitimately contain;
  // written as escapes because the literal characters are invisible in source.
  if (!/^\p{L}[\p{L}\p{M}\u200c\u200d\s.'-]*$/u.test(v)) {
    return `${label} can only contain letters, spaces, apostrophes and hyphens.`;
  }
  return null;
}

/**
 * A brand name is not a person's name: "7-Eleven", "Barnes & Noble" and
 * "Café 21" are all legitimate, so only length is constrained here.
 */
export function brandName(value: string, label = "Brand name"): string | null {
  const v = value.trim();
  if (v === "") return `${label} is required.`;
  if (v.length > LIMITS.brandName) return `${label} must be ${LIMITS.brandName} characters or fewer.`;
  return null;
}

/** Indian 10-digit mobile number, without the +91 prefix. */
export function mobile(value: string, label = "Mobile number"): string | null {
  const v = value.trim();
  if (v === "") return `${label} is required.`;
  if (!/^\d{10}$/.test(v)) return `Enter a valid 10-digit ${label.toLowerCase()}.`;
  if (!/^[6-9]/.test(v)) return `${label} must start with 6, 7, 8 or 9.`;
  return null;
}

/**
 * Any international mobile, 8–15 digits, optionally `+`-prefixed.
 *
 * Participants can enrol with any country code, so opt-outs and test sends must
 * not be restricted to +91 — otherwise a foreign number that asked to STOP
 * could never be added to the suppression list.
 */
export function anyMobile(value: string, label = "Mobile number"): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits === "") return `${label} is required.`;
  if (!/^\d{8,15}$/.test(digits)) return `Enter a valid ${label.toLowerCase()} (8–15 digits).`;
  return null;
}

export function email(value: string, label = "Email"): string | null {
  const v = value.trim();
  if (v === "") return `${label} is required.`;
  if (v.length > 190) return `${label} must be 190 characters or fewer.`;
  // No TLD requirement: an existing admin account may be `admin@localhost`,
  // and locking them out of their own console is worse than a loose check.
  if (!/^[^\s@]+@[^\s@]+$/.test(v)) return `Enter a valid ${label.toLowerCase()} address.`;
  return null;
}

export function password(value: string, label = "Password"): string | null {
  if (value === "") return `${label} is required.`;
  if (value.length < 6) return `${label} must be at least 6 characters.`;
  return null;
}

export function hexColor(value: string, label = "Theme colour"): string | null {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim())
    ? null
    : `${label} must be a 6-digit hex colour, e.g. #ef5a7f.`;
}

/** IANA timezone such as `Asia/Kolkata`, checked against the browser's own data. */
export function timezone(value: string, label = "Timezone"): string | null {
  const v = value.trim();
  if (v === "") return `${label} is required.`;
  if (v.length > LIMITS.timezone) return `${label} must be ${LIMITS.timezone} characters or fewer.`;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: v });
    return null;
  } catch {
    return `${label} is not a valid IANA zone (e.g. Asia/Kolkata).`;
  }
}

/** `YYYY-MM-DD`, optional by default because most date fields are. */
export function isoDate(value: string, label = "Date", allowBlank = true): string | null {
  const v = value.trim();
  if (v === "") return allowBlank ? null : `${label} is required.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${label} must be a valid date.`;
  const d = new Date(`${v}T00:00:00`);
  if (Number.isNaN(d.getTime())) return `${label} must be a valid date.`;
  return null;
}

/** End must not fall before start; blank on either side means "open ended". */
export function dateOrder(start: string, end: string): string | null {
  if (!start.trim() || !end.trim()) return null;
  return end < start ? "End date must be on or after the start date." : null;
}

/** WhatsApp template handle: lowercase letters, digits and underscores. */
export function templateName(value: string, label = "Name"): string | null {
  const v = value.trim();
  if (v === "") return `${label} is required.`;
  if (v.length > LIMITS.templateName) {
    return `${label} must be ${LIMITS.templateName} characters or fewer.`;
  }
  if (!/^[a-z][a-z0-9_ ]*$/i.test(v)) {
    return `${label} can only contain letters, digits, spaces and underscores.`;
  }
  return null;
}

/** Meta phone-number id — digits only, and optional. */
export function phoneNumberId(value: string, label = "Phone Number ID"): string | null {
  const v = value.trim();
  if (v === "") return null;
  if (!/^\d+$/.test(v)) return `${label} must contain digits only.`;
  if (v.length > LIMITS.phoneNumberId) {
    return `${label} must be ${LIMITS.phoneNumberId} characters or fewer.`;
  }
  return null;
}

// ---------------------------------------------------------------- images ---

/**
 * SVG is deliberately absent: every other format is re-encoded through a canvas
 * on upload, so a spoofed file cannot survive, whereas an SVG would be stored
 * byte-for-byte and is rendered on the public check-in page. The API rejects it
 * too — keep the two lists in step.
 */
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** Reject non-images and anything absurdly large before we try to decode it. */
export function imageFile(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) {
    return "Choose a PNG, JPG, WebP or GIF image.";
  }
  // Pre-downscale ceiling: a 10 MB source still resizes fine, beyond that the
  // decode itself is the problem.
  if (file.size > 10 * 1024 * 1024) {
    return "Image must be under 10 MB.";
  }
  return null;
}
