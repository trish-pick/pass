import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { copy } from "@/lib/copy";

import { SignInForm } from "./sign-in-form";

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { error } = await searchParams;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-16">
      <div className="text-center">
        <p className="text-2xl font-semibold tracking-tight">{copy.product.name}</p>
        <p className="text-muted-foreground text-sm">{copy.product.fullName}</p>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{copy.signIn.title}</CardTitle>
          <CardDescription>{copy.signIn.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && (
            <p className="text-destructive text-sm" role="alert">
              {copy.signIn.linkError}
            </p>
          )}
          <SignInForm />
        </CardContent>
      </Card>
      <p className="text-muted-foreground max-w-sm text-center text-xs">{copy.product.tagline}</p>
    </main>
  );
}
