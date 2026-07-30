"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";

type Step = 1 | 2 | 3;

function StepDot({ active, done }: { active: boolean; done: boolean }) {
  return (
    <div
      className={
        "w-4 h-4 rounded-full border flex items-center justify-center text-[9px] " +
        (active || done
          ? "border-nw-green text-nw-green bg-nw-green-tint"
          : "border-nw-line-hi text-nw-muted")
      }
    />
  );
}

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [username, setUsername] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleStep1(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ security_question: string }>(
        "/auth/forgot-password/question",
        { username }
      );
      setQuestion(res.security_question);
      setStep(2);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleStep2(e: React.FormEvent) {
    e.preventDefault();
    setStep(3);
  }

  async function handleStep3(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/auth/forgot-password/reset", {
        username,
        security_answer: answer,
        new_password: newPassword,
      });
      setDone(true);
    } catch (err) {
      // Same neutral copy whether the username or the answer was wrong — no enumeration.
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm flex flex-col gap-4 text-center">
          <h1 className="text-base font-medium">Password updated</h1>
          <p className="text-sm text-nw-muted">
            You can now sign in with your new password.
          </p>
          <Button variant="primary" onClick={() => router.push("/login")}>
            Back to sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm flex flex-col gap-4">
        <p className="text-xs uppercase tracking-wide text-nw-muted">
          Forgot password — 3 steps, one screen
        </p>
        <div className="flex items-center gap-2">
          <StepDot active={step === 1} done={step > 1} />
          <div className="flex-1 h-px bg-nw-border" />
          <StepDot active={step === 2} done={step > 2} />
          <div className="flex-1 h-px bg-nw-border" />
          <StepDot active={step === 3} done={false} />
        </div>

        {step === 1 && (
          <form onSubmit={handleStep1} className="flex flex-col gap-3">
            <TextField
              label="Step 1 · Username"
              name="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            {error && <ErrorBox message={error} />}
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Checking…" : "Continue"}
            </Button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleStep2} className="flex flex-col gap-3">
            <TextField
              label={`Step 2 · ${question}`}
              name="answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              required
            />
            <Button type="submit" variant="primary">
              Continue
            </Button>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleStep3} className="flex flex-col gap-3">
            <TextField
              label="Step 3 · New password"
              name="newPassword"
              type="password"
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <TextField
              label="Confirm new password"
              name="confirmPassword"
              type="password"
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            {error && <ErrorBox message={error} />}
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Saving…" : "Set new password"}
            </Button>
          </form>
        )}

        <p className="text-xs text-nw-muted leading-relaxed">
          An unknown username gets the same response as a wrong answer — we never confirm
          whether an account exists. No email or SMS anywhere in this flow.
        </p>
      </div>
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
