"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";

// Keep in sync with backend/app/schemas/auth.py SECURITY_QUESTIONS.
const SECURITY_QUESTIONS = [
  "What was your first pet's name?",
  "What city were you born in?",
  "What was the make of your first car?",
  "What is your mother's maiden name?",
  "What was the name of your first school?",
];

export default function SetupPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    username: "",
    password: "",
    confirmPassword: "",
    securityQuestion: SECURITY_QUESTIONS[0],
    securityAnswer: "",
    birthdate: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/auth/setup", {
        username: form.username,
        password: form.password,
        confirm_password: form.confirmPassword,
        security_question: form.securityQuestion,
        security_answer: form.securityAnswer,
        birthdate: form.birthdate || null,
      });
      await login(form.username, form.password);
      router.push("/overview");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Image src="/brand/brandmark.png" alt="" width={26} height={26} />
          <h1 className="text-base font-medium">Set up your account</h1>
        </div>
        <p className="text-sm text-nw-muted">
          Your household was invited. Enter the username you were given and choose a
          password to activate it.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <TextField
            label="Username"
            name="username"
            value={form.username}
            onChange={(e) => update("username", e.target.value)}
            required
          />
          <TextField
            label="New password"
            name="password"
            type="password"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            minLength={8}
            required
          />
          <TextField
            label="Confirm password"
            name="confirmPassword"
            type="password"
            value={form.confirmPassword}
            onChange={(e) => update("confirmPassword", e.target.value)}
            minLength={8}
            required
          />
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-nw-muted">
              Security question
            </label>
            <select
              value={form.securityQuestion}
              onChange={(e) => update("securityQuestion", e.target.value)}
              className="rounded-md border border-nw-border bg-nw-rail px-3 py-2 text-sm text-nw-text"
            >
              {SECURITY_QUESTIONS.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </div>
          <TextField
            label="Your answer"
            name="securityAnswer"
            value={form.securityAnswer}
            onChange={(e) => update("securityAnswer", e.target.value)}
            required
          />
          <TextField
            label="Birthdate (optional)"
            name="birthdate"
            type="date"
            value={form.birthdate}
            onChange={(e) => update("birthdate", e.target.value)}
          />
          <p className="text-xs text-nw-muted -mt-2">
            Used to calculate your age for retirement and FI projections — you can add this later in Settings.
          </p>
          {error && (
            <div className="rounded-md border border-[#5A3228] bg-nw-coral-tint px-3 py-2 text-xs text-nw-coral">
              {error}
            </div>
          )}
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? "Activating…" : "Activate household"}
          </Button>
        </form>
      </div>
    </div>
  );
}
