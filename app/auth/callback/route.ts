import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Where the emailed sign-in link lands. Handles both the default Supabase
 * link (?code=, same browser only) and a token-hash link (?token_hash=&type=,
 * works on any device) if the email template is changed to use one.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();

  let error: unknown = null;
  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && type) {
    ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
  } else {
    error = new Error("Missing sign-in token");
  }

  if (error) {
    return NextResponse.redirect(new URL("/sign-in?error=link", origin));
  }

  // Link any practice invitations for this email to the account.
  await supabase.rpc("claim_invites");

  return NextResponse.redirect(new URL("/", origin));
}
