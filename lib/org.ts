import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type Role = "owner" | "reviewer" | "drafter";

export type Membership = {
  userId: string;
  email: string | null;
  orgId: string;
  orgName: string;
  role: Role;
};

/**
 * The signed-in user and their organisation. Redirects to /sign-in when
 * signed out; returns membership null when signed in without a practice.
 *
 * A user in more than one organisation gets their earliest membership for now.
 * An organisation switcher arrives with Phase 4 onboarding.
 */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/sign-in");

  const { data: rows } = await supabase
    .from("members")
    .select("org_id, role, organisations (name)")
    .eq("user_id", claims.sub)
    .order("created_at", { ascending: true })
    .limit(1);

  const row = rows?.[0] as
    | { org_id: string; role: Role; organisations: { name: string } | null }
    | undefined;

  const membership: Membership | null = row
    ? {
        userId: claims.sub,
        email: (claims.email as string | undefined) ?? null,
        orgId: row.org_id,
        orgName: row.organisations?.name ?? "",
        role: row.role,
      }
    : null;

  return { supabase, userId: claims.sub, email: (claims.email as string | undefined) ?? null, membership };
});

/** For pages inside the app shell, which only renders them when a membership exists. */
export async function requireMembership() {
  const session = await getSession();
  if (!session.membership) redirect("/");
  return { supabase: session.supabase, membership: session.membership };
}
