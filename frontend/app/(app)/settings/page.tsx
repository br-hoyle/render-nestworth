"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Account, HouseholdSettings, IncomeRecord, TransactionListResponse } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Card } from "@/components/ui/Card";

const SECURITY_QUESTIONS = [
  "What was your first pet's name?",
  "What city were you born in?",
  "What was the make of your first car?",
  "What is your mother's maiden name?",
  "What was the name of your first school?",
];

export default function SettingsPage() {
  const { session, refresh, logout } = useAuth();
  const router = useRouter();

  const [householdName, setHouseholdName] = useState("");
  const [householdSaving, setHouseholdSaving] = useState(false);
  const [householdMsg, setHouseholdMsg] = useState<string | null>(null);

  const [birthdate, setBirthdate] = useState("");
  const [birthdateSaving, setBirthdateSaving] = useState(false);
  const [birthdateMsg, setBirthdateMsg] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [secQuestionPassword, setSecQuestionPassword] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState(SECURITY_QUESTIONS[0]);
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [secQuestionMsg, setSecQuestionMsg] = useState<string | null>(null);
  const [secQuestionSaving, setSecQuestionSaving] = useState(false);

  const [settings, setSettings] = useState<HouseholdSettings | null>(null);
  const [prefsSaving, setPrefsSaving] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (session) {
      setHouseholdName(session.household_name);
      setBirthdate(session.birthdate ?? "");
    }
    api.get<HouseholdSettings>("/settings").then(setSettings);
  }, [session]);

  async function saveHouseholdName(e: React.FormEvent) {
    e.preventDefault();
    setHouseholdSaving(true);
    setHouseholdMsg(null);
    try {
      await api.patch("/auth/household-name", { household_name: householdName });
      await refresh();
      setHouseholdMsg("Saved.");
    } catch (err) {
      setHouseholdMsg(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setHouseholdSaving(false);
    }
  }

  async function saveBirthdate(e: React.FormEvent) {
    e.preventDefault();
    setBirthdateSaving(true);
    setBirthdateMsg(null);
    try {
      await api.patch("/auth/birthdate", { birthdate: birthdate || null });
      await refresh();
      setBirthdateMsg("Saved.");
    } catch (err) {
      setBirthdateMsg(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBirthdateSaving(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordSaving(true);
    setPasswordMsg(null);
    try {
      await api.post("/auth/change-password", { current_password: currentPassword, new_password: newPassword });
      setPasswordMsg("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setPasswordMsg(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setPasswordSaving(false);
    }
  }

  async function saveSecurityQuestion(e: React.FormEvent) {
    e.preventDefault();
    setSecQuestionSaving(true);
    setSecQuestionMsg(null);
    try {
      await api.post("/auth/change-security-question", {
        current_password: secQuestionPassword,
        security_question: securityQuestion,
        security_answer: securityAnswer,
      });
      setSecQuestionMsg("Security question updated.");
      setSecQuestionPassword("");
      setSecurityAnswer("");
    } catch (err) {
      setSecQuestionMsg(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSecQuestionSaving(false);
    }
  }

  async function savePrefs(patch: Partial<HouseholdSettings>) {
    setPrefsSaving(true);
    try {
      const updated = await api.patch<HouseholdSettings>("/settings", patch);
      setSettings(updated);
    } finally {
      setPrefsSaving(false);
    }
  }

  async function exportData() {
    setExporting(true);
    try {
      const [accounts, income, transactionPage] = await Promise.all([
        api.get<Account[]>("/accounts?filter=all"),
        api.get<IncomeRecord[]>("/income"),
        api.get<TransactionListResponse>("/transactions?limit=1000"),
      ]);
      const transactions = transactionPage.items;
      const blob = new Blob([JSON.stringify({ accounts, income, transactions }, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "nestworth-export.json";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  async function deleteHousehold() {
    if (deleteConfirm !== session?.household_name) return;
    setDeleting(true);
    try {
      await api.delete("/settings/household");
      await logout();
      router.push("/login");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-lg flex flex-col gap-4">
      <h1 className="text-lg font-medium">Settings</h1>

      <Card>
        <div className="text-sm font-medium">Household</div>
        <form onSubmit={saveHouseholdName} className="flex gap-2 items-end">
          <div className="flex-1">
            <TextField
              label="Display name"
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
            />
          </div>
          <Button type="submit" variant="primary" disabled={householdSaving}>
            Save
          </Button>
        </form>
        {householdMsg && <p className="text-xs text-nw-muted">{householdMsg}</p>}
        <div className="flex justify-between text-sm">
          <span className="text-nw-muted">Username</span>
          <span>{session?.username} · not changeable</span>
        </div>

        <form onSubmit={saveBirthdate} className="flex gap-2 items-end pt-3 border-t border-nw-border">
          <div className="flex-1">
            <TextField
              label="Birthdate"
              type="date"
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
            />
          </div>
          <Button type="submit" variant="primary" disabled={birthdateSaving}>
            Save
          </Button>
        </form>
        {birthdateMsg && <p className="text-xs text-nw-muted">{birthdateMsg}</p>}
        <p className="text-xs text-nw-muted">
          Used to calculate your age for retirement and FI projections on the{" "}
          <a href="/trends/scorecard" className="text-nw-mint">
            Scorecard
          </a>
          .
        </p>
      </Card>

      <Card>
        <div className="text-sm font-medium">Security</div>
        <form onSubmit={savePassword} className="flex flex-col gap-2">
          <TextField
            label="Current password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <TextField
            label="New password"
            type="password"
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          {passwordMsg && <p className="text-xs text-nw-muted">{passwordMsg}</p>}
          <Button type="submit" variant="primary" disabled={passwordSaving} className="self-start">
            Change password
          </Button>
        </form>

        <form onSubmit={saveSecurityQuestion} className="flex flex-col gap-2 mt-3 pt-3 border-t border-nw-border">
          <TextField
            label="Current password"
            type="password"
            value={secQuestionPassword}
            onChange={(e) => setSecQuestionPassword(e.target.value)}
          />
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-nw-muted">New security question</label>
            <select
              value={securityQuestion}
              onChange={(e) => setSecurityQuestion(e.target.value)}
              className="rounded-md border border-nw-border bg-nw-rail px-3 py-2 text-sm"
            >
              {SECURITY_QUESTIONS.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </div>
          <TextField label="Answer" value={securityAnswer} onChange={(e) => setSecurityAnswer(e.target.value)} />
          {secQuestionMsg && <p className="text-xs text-nw-muted">{secQuestionMsg}</p>}
          <Button type="submit" variant="primary" disabled={secQuestionSaving} className="self-start">
            Change security question
          </Button>
        </form>

        <div className="flex justify-between text-sm pt-3 border-t border-nw-border">
          <span className="text-nw-muted">Session timeout</span>
          <span>1 hour inactivity · fixed</span>
        </div>
      </Card>

      {settings && (
        <Card>
          <div className="text-sm font-medium">Preferences</div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-nw-muted">Stale threshold (days)</span>
            <input
              type="number"
              defaultValue={settings.stale_threshold_days}
              onBlur={(e) => savePrefs({ stale_threshold_days: Number(e.target.value) })}
              className="w-20 rounded-md border border-nw-border bg-nw-rail px-2 py-1 text-right"
            />
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-nw-muted">Default date range (months)</span>
            <input
              type="number"
              defaultValue={settings.default_range_months}
              onBlur={(e) => savePrefs({ default_range_months: Number(e.target.value) })}
              className="w-20 rounded-md border border-nw-border bg-nw-rail px-2 py-1 text-right"
            />
          </div>
          <p className="text-xs text-nw-muted">
            Per-metric KPI thresholds are edited from each tile&apos;s detail panel on the{" "}
            <a href="/trends/scorecard" className="text-nw-mint">
              Scorecard
            </a>
            .
          </p>
          {prefsSaving && <p className="text-xs text-nw-muted">Saving…</p>}
        </Card>
      )}

      <Card>
        <div className="text-sm font-medium">Data</div>
        <Button onClick={exportData} disabled={exporting}>
          {exporting ? "Exporting…" : "Export all data"}
        </Button>
        <div className="pt-3 border-t border-nw-border flex flex-col gap-2">
          <span className="text-xs text-nw-coral">Danger zone</span>
          <p className="text-xs text-nw-muted">
            Type <b>{session?.household_name}</b> to confirm deleting this household and all of its data. This
            cannot be undone.
          </p>
          <TextField value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} />
          <Button
            variant="danger"
            disabled={deleteConfirm !== session?.household_name || deleting}
            onClick={deleteHousehold}
          >
            {deleting ? "Deleting…" : "Delete household"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
