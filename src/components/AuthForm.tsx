"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "./Button";

export function AuthForm({ nextPath = "/" }: { nextPath?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setStatus(null);

    const supabase = createSupabaseBrowserClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });

    setSubmitting(false);
    if (error) {
      setStatus(error.message);
      return;
    }
    setStatus("Check your email for a sign-in link.");
  }

  return (
    <form className="form-panel auth-panel" onSubmit={onSubmit}>
      <label>
        Email
        <input
          className="text-input"
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      {status ? <p className="notice">{status}</p> : null}
      <Button disabled={submitting} type="submit">
        {submitting ? "Sending link..." : "Send magic link"}
      </Button>
    </form>
  );
}
