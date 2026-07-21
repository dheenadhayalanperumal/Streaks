"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { fileToDataUrl } from "@/lib/image";
import { imageFile } from "@/lib/validation";

export function Topbar({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="topbar">
      <div>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {action}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  onSubmit,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  /** When given, the dialog becomes a real form so Enter submits it. */
  onSubmit?: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Escape closes the dialog — expected of any modal, and the only exit for
  // keyboard users since the overlay click is pointer-only. Dialogs can stack
  // (a user detail with an adjust form over it), so only the topmost responds,
  // otherwise one keypress would dismiss the whole stack.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const open = document.querySelectorAll('[role="dialog"]');
      if (open.length && open[open.length - 1] !== dialogRef.current) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Move focus into the dialog on open and hand it back to whatever opened it
  // on close; without this, `aria-modal` claims a containment that the keyboard
  // does not actually honour and Tab walks the page behind the overlay.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    focusables(dialogRef.current)[0]?.focus();
    return () => opener?.focus?.();
  }, []);

  // Minimal focus trap: cycle Tab within the dialog.
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Tab") return;
    const items = focusables(dialogRef.current);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const inner = (
    <>
      <div className="body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <header>
          <h2>{title}</h2>
          <button type="button" className="x" aria-label="Close" onClick={onClose}>×</button>
        </header>
        {onSubmit ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
            noValidate
          >
            {inner}
          </form>
        ) : (
          inner
        )}
      </div>
    </div>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/** Native controls we can safely own the id / aria wiring for. */
const CONTROLS = new Set(["input", "select", "textarea"]);

/**
 * Labelled form control with inline validation.
 *
 * When the child is a single native control, the label is bound to it and the
 * error is wired up via `aria-invalid` / `aria-describedby`, so the state is
 * available to a screen reader and not just to the eye. For composite children
 * (a row of inputs, an ImageUpload) the label is rendered as plain text instead
 * — a `<label>` pointing at nothing is worse than no label element at all.
 *
 * Errors surface once the field has been left, or as soon as the parent form
 * marks itself `touched` on a failed submit.
 */
export function Field({
  label,
  hint,
  error,
  touched = false,
  counter,
  required,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  touched?: boolean;
  counter?: string;
  required?: boolean;
  children: ReactNode;
}) {
  const uid = useId();
  const [blurred, setBlurred] = useState(false);
  const show = (touched || blurred) && !!error;

  const child = isValidElement(children) ? (children as ReactElement<Record<string, unknown>>) : null;
  const isControl = typeof child?.type === "string" && CONTROLS.has(child.type);

  const controlId = (child?.props?.id as string | undefined) ?? uid;
  const errorId = `${uid}-error`;
  const hintId = `${uid}-hint`;
  const describedBy = show ? errorId : hint ? hintId : undefined;

  const control = isControl
    ? cloneElement(child, {
        id: controlId,
        "aria-invalid": show || undefined,
        "aria-describedby": describedBy,
        onBlur: (e: React.FocusEvent) => {
          setBlurred(true);
          (child.props.onBlur as ((e: React.FocusEvent) => void) | undefined)?.(e);
        },
      })
    : children;

  const labelBody = (
    <>
      {label}
      {required && <span className="field-req" aria-hidden>*</span>}
      {counter && (
        <span className="field-counter" aria-hidden>
          {counter}
        </span>
      )}
    </>
  );

  return (
    <div className={`field ${show ? "invalid" : ""}`}>
      {isControl ? (
        <label htmlFor={controlId}>{labelBody}</label>
      ) : (
        <span className="field-label">{labelBody}</span>
      )}
      {control}
      {show ? (
        <div className="field-error" id={errorId} role="alert">
          {error}
        </div>
      ) : (
        hint && (
          <div className="field-hint" id={hintId}>
            {hint}
          </div>
        )
      )}
    </div>
  );
}

/**
 * After a failed submit, put the caret on the first field that needs attention.
 *
 * Long forms scroll — the campaign dialog is ~15 fields — so without this the
 * user is left staring at a banner with the offending input somewhere off
 * screen. Runs on the next frame so the `.invalid` classes have been committed.
 */
export function focusFirstInvalid(root?: HTMLElement | null) {
  requestAnimationFrame(() => {
    const scope: ParentNode = root ?? document;
    const el = scope.querySelector<HTMLElement>(".field.invalid input, .field.invalid select, .field.invalid textarea");
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.focus({ preventScroll: true });
  });
}

/**
 * Image picker used everywhere an image is attached (brand logo, reward image).
 *
 * The picked file is downscaled in the browser and handed back as a `data:`
 * URI, so callers just store a string — the same shape the old "image URL"
 * fields used, which keeps the API unchanged.
 *
 * The drop zone is a real `<label>` over a visually-hidden file input rather
 * than a `role="button"` div, so screen readers get the native file-upload
 * control (with its accept list and filename readback) instead of a mimic.
 */
export function ImageUpload({
  value,
  onChange,
  onError,
  label = "Upload image",
  hint = "PNG, JPG, WebP or SVG. Bitmaps are resized automatically.",
  shape = "square",
}: {
  value: string;
  onChange: (dataUrl: string) => void;
  onError?: (message: string) => void;
  label?: string;
  hint?: ReactNode;
  shape?: "square" | "wide";
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [dragging, setDragging] = useState(false);

  async function accept(file: File | undefined) {
    if (!file) return;
    const bad = imageFile(file);
    if (bad) {
      setStatus("");
      return onError?.(bad);
    }
    setBusy(true);
    setStatus("Processing image…");
    try {
      onChange(await fileToDataUrl(file));
      onError?.("");
      setStatus(`${file.name} added.`);
    } catch (err) {
      setStatus("");
      onError?.(err instanceof Error ? err.message : "Could not read that image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="img-upload">
      {/* The input lives inside the label, so the label both labels it and acts
          as the click/drop target — one tab stop, native semantics, our styling. */}
      <label
        className={`img-drop ${shape} ${dragging ? "over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          accept(e.dataTransfer.files?.[0]);
        }}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="Selected image preview" className="img-preview" />
        ) : (
          <span className="img-placeholder" aria-hidden>🖼</span>
        )}
        <span className="img-cta">{busy ? "Processing…" : value ? "Replace" : label}</span>
        <input
          type="file"
          className="img-input"
          accept="image/png,image/jpeg,image/webp,image/gif"
          aria-label={label}
          aria-busy={busy || undefined}
          onChange={(e) => {
            accept(e.target.files?.[0]);
            e.target.value = ""; // allow re-picking the same file
          }}
        />
      </label>
      <div className="img-actions">
        {value && (
          <button type="button" className="btn ghost sm" onClick={() => { onChange(""); setStatus("Image removed."); }}>
            Remove
          </button>
        )}
        <span className="muted img-hint">{hint}</span>
      </div>
      <div className="sr-only" role="status">
        {status}
      </div>
    </div>
  );
}

const AVATAR_COLORS = ["#ff6a3d", "#4d8dff", "#35d07f", "#9b7bff", "#ffb43d", "#ff5c6c"];

export function Avatar({ name }: { name: string | null }) {
  const label = (name || "?").trim();
  const initials = label.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  const color = AVATAR_COLORS[label.length % AVATAR_COLORS.length];
  return (
    <div className="avatar" style={{ background: color }}>
      {initials}
    </div>
  );
}

export function TypePill({ type }: { type: string }) {
  const map: Record<string, string> = {
    daily: "orange",
    weekly: "blue",
    monthly: "purple",
    custom: "green",
    coupon: "orange",
    points: "blue",
    badge: "purple",
    unlocked: "blue",
    redeemed: "green",
    expired: "red",
    active: "green",
    broken: "red",
  };
  return <span className={`pill ${map[type] || "gray"}`}>{type.replace("_", " ")}</span>;
}
