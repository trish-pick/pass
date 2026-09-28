"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { copy } from "@/lib/copy";

import { sendSignInLink, type SignInState } from "./actions";

const initialState: SignInState = { status: "idle" };

export function SignInForm() {
  const [state, action, pending] = useActionState(sendSignInLink, initialState);

  if (state.status === "sent") {
    return <p className="text-sm">{copy.signIn.sent}</p>;
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{copy.signIn.emailLabel}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      {state.status === "error" && (
        <p className="text-destructive text-sm" role="alert">
          {copy.signIn.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {copy.signIn.submit}
      </Button>
    </form>
  );
}
