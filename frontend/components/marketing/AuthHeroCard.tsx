"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
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

type Mode = "signin" | "create";
type CreateStep = 1 | 2 | 3 | 4;

function tabClass(active: boolean) {
  return clsx(
    "flex-1 rounded-[7px] px-4 py-2.5 text-sm font-semibold transition-colors",
    // Matches the primary Button colorway, per brand guide: the active state is the same
    // "this is the live action" green as the Sign in / Create household submit buttons.
    active ? "bg-nw-green text-nw-bg" : "text-nw-muted hover:text-nw-text"
  );
}

function StepDot({ active, done }: { active: boolean; done: boolean }) {
  return (
    <div
      className={clsx(
        "w-4 h-4 rounded-full border flex-none",
        active || done ? "border-nw-green bg-nw-green-tint" : "border-nw-line-hi"
      )}
    />
  );
}

export function AuthHeroCard() {
  const { login } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [step, setStep] = useState<CreateStep>(1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [householdName, setHouseholdName] = useState("");
  const [createUsername, setCreateUsername] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState(SECURITY_QUESTIONS[0]);
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [friendsFamilyCode, setFriendsFamilyCode] = useState("");

  function switchMode(next: Mode) {
    setMode(next);
    setStep(1);
    setError(null);
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      router.push("/overview");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleStep1(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStep(2);
  }

  function handleStep2(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (createPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setStep(3);
  }

  function handleStep3(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStep(4);
  }

  async function handleStep4(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/auth/signup", {
        household_name: householdName,
        username: createUsername,
        password: createPassword,
        confirm_password: confirmPassword,
        security_question: securityQuestion,
        security_answer: securityAnswer,
        friends_family_code: friendsFamilyCode,
        birthdate: null,
      });
      await login(createUsername, createPassword);
      router.push("/overview");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="nw-elevate nw-marketing-card rounded-2xl border border-nw-border bg-nw-rail p-6 md:p-8 w-full max-w-md">
      <div className="flex bg-nw-bg border border-nw-border rounded-[10px] p-1 gap-1">
        <button type="button" className={tabClass(mode === "signin")} onClick={() => switchMode("signin")}>
          Sign in
        </button>
        <button type="button" className={tabClass(mode === "create")} onClick={() => switchMode("create")}>
          Create account
        </button>
      </div>

      {mode === "signin" ? (
        <form onSubmit={handleSignIn} className="flex flex-col gap-3 mt-5">
          <TextField
            label="Username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <TextField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <ErrorBox message={error} />}
          <Button type="submit" variant="primary" disabled={submitting} className="mt-1">
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
          <Link href="/forgot-password" className="text-xs text-nw-mint self-start">
            Forgot password?
          </Link>
        </form>
      ) : (
        <div className="flex flex-col gap-3 mt-5">
          <div className="flex items-center gap-2">
            <StepDot active={step === 1} done={step > 1} />
            <div className="flex-1 h-px bg-nw-border" />
            <StepDot active={step === 2} done={step > 2} />
            <div className="flex-1 h-px bg-nw-border" />
            <StepDot active={step === 3} done={step > 3} />
            <div className="flex-1 h-px bg-nw-border" />
            <StepDot active={step === 4} done={false} />
          </div>

          {step === 1 && (
            <form onSubmit={handleStep1} className="flex flex-col gap-3">
              <TextField
                label="Household name"
                name="household"
                placeholder="The Harts"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                required
              />
              <TextField
                label="Username"
                name="createUsername"
                autoComplete="username"
                value={createUsername}
                onChange={(e) => setCreateUsername(e.target.value)}
                required
              />
              <Button type="submit" variant="primary" className="mt-1">
                Continue
              </Button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleStep2} className="flex flex-col gap-3">
              <TextField
                label="Password"
                name="createPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                required
              />
              <TextField
                label="Confirm password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              {error && <ErrorBox message={error} />}
              <div className="flex gap-2 mt-1">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button type="submit" variant="primary" className="flex-1">
                  Continue
                </Button>
              </div>
            </form>
          )}

          {step === 3 && (
            <form onSubmit={handleStep3} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] uppercase tracking-wide text-nw-muted">Security question</label>
                <select
                  value={securityQuestion}
                  onChange={(e) => setSecurityQuestion(e.target.value)}
                  className="rounded-md border border-nw-border bg-nw-bg px-3 py-2 text-sm text-nw-text"
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
                value={securityAnswer}
                onChange={(e) => setSecurityAnswer(e.target.value)}
                required
              />
              {error && <ErrorBox message={error} />}
              <div className="flex gap-2 mt-1">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button type="submit" variant="primary" className="flex-1">
                  Continue
                </Button>
              </div>
            </form>
          )}

          {step === 4 && (
            <form onSubmit={handleStep4} className="flex flex-col gap-3">
              <TextField
                label="Invitation Code"
                name="friendsFamilyCode"
                value={friendsFamilyCode}
                onChange={(e) => setFriendsFamilyCode(e.target.value)}
                required
              />
              {error && <ErrorBox message={error} />}
              <div className="flex gap-2 mt-1">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setStep(3)} disabled={submitting}>
                  Back
                </Button>
                <Button type="submit" variant="primary" className="flex-1" disabled={submitting}>
                  {submitting ? "Creating…" : "Create household"}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-[#5A3228] bg-nw-coral-tint px-3 py-2 text-xs text-nw-coral">
      {message}
    </div>
  );
}
