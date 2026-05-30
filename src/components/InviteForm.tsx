"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./Button";

export function InviteForm({ nextPath = "/add" }: { nextPath?: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setStatus(null);

    const response = await fetch("/api/invites/redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });

    setSubmitting(false);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Could not redeem invite." }));
      setStatus(payload.error ?? "Could not redeem invite.");
      return;
    }

    router.push(nextPath);
    router.refresh();
  }

  return (
    <form className="form-panel auth-panel" onSubmit={onSubmit}>
      <label>
        Invite code
        <input
          className="text-input"
          name="code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          required
        />
      </label>
      {status ? <p className="form-error">{status}</p> : null}
      <Button disabled={submitting} type="submit">
        {submitting ? "Checking..." : "Unlock adding recs"}
      </Button>
    </form>
  );
}
