"use client";

import { useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Card } from "@/components/ui/Card";
import { LoadingBlock } from "@/components/ui/Spinner";

interface Invite {
  household_id: string;
  household_name: string;
  username: string;
  status: string;
}

export default function InvitesPage() {
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [notOwner, setNotOwner] = useState(false);
  const [householdName, setHouseholdName] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      const data = await api.get<Invite[]>("/admin/invites");
      setInvites(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNotOwner(true);
      }
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (notOwner) {
    notFound();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/admin/invites", { household_name: householdName, username });
      setHouseholdName("");
      setUsername("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl flex flex-col gap-4">
      <h1 className="text-lg font-medium">Invites</h1>
      <Card>
        <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <TextField
            label="Household display name"
            value={householdName}
            onChange={(e) => setHouseholdName(e.target.value)}
            placeholder="Nguyen family"
            required
          />
          <TextField
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="nguyens"
            required
          />
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? "Inviting…" : "+ Invite"}
          </Button>
        </form>
        {error && <p className="text-xs text-nw-coral">{error}</p>}
      </Card>

      <div className="flex flex-col">
        {invites === null && <LoadingBlock />}
        {invites?.map((inv) => (
          <div
            key={inv.household_id}
            className="grid grid-cols-[1fr_auto_auto] gap-3 items-center border-t border-nw-border py-2 text-sm first:border-t-0"
          >
            <span>{inv.household_name}</span>
            <span className="text-nw-muted text-xs">{inv.username}</span>
            <span
              className={
                "text-xs px-2 py-0.5 rounded-full border " +
                (inv.status === "active"
                  ? "border-nw-green-line text-nw-mint bg-nw-green-tint"
                  : "border-nw-border text-nw-amber")
              }
            >
              {inv.status}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-nw-muted">
        Non-owner access to this route returns 404, not 403.
      </p>
    </div>
  );
}
