"use server";

import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";

export type SignInState = { status: "idle" | "sent" | "error" };

export async function sendSignInLink(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { status: "error" };

  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      // Accounts are created on first sign-in; access comes only from an invitation.
      shouldCreateUser: true,
    },
  });

  return { status: error ? "error" : "sent" };
}
