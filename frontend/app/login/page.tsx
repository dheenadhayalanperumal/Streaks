"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";
import { Field } from "../components";
import { email as validEmail, hasErrors, password as validPassword } from "@/lib/validation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@streaks.test");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  const errors = useMemo(
    () => ({ email: validEmail(email), password: validPassword(password) }),
    [email, password],
  );
  const invalid = hasErrors(errors);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (invalid) return;
    setError("");
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace("/admin/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="card pad-lg login-card">
        <div className="brand">
          <span className="flame">🔥</span> Streaks
        </div>
        <p className="login-sub">Campaign operator sign-in</p>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={submit} noValidate>
          <Field label="Email" required error={errors.email} touched={touched}>
            <input
              className="input"
              type="email"
              autoComplete="username"
              value={email}
              maxLength={190}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password" required error={errors.password} touched={touched}>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <button className="btn primary" style={{ width: "100%", justifyContent: "center" }} disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="hint">Demo: admin@streaks.test / admin123</p>
      </div>
    </div>
  );
}
