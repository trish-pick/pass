import Link from "next/link";

import { AppNav } from "@/components/layout/app-nav";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { copy } from "@/lib/copy";
import { getSession } from "@/lib/org";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { membership, email } = await getSession();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-semibold tracking-tight">
              {copy.product.name}
            </Link>
            {membership && <AppNav />}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground hidden text-sm sm:inline">
              {membership?.orgName ?? email}
            </span>
            <form action="/auth/sign-out" method="post">
              <Button type="submit" variant="ghost" size="sm">
                {copy.nav.signOut}
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {membership ? (
          children
        ) : (
          <Card className="mx-auto max-w-md">
            <CardHeader>
              <CardTitle>{copy.noOrganisation.title}</CardTitle>
              <CardDescription>{copy.noOrganisation.description}</CardDescription>
            </CardHeader>
          </Card>
        )}
      </main>

      <footer className="border-t">
        <p className="text-muted-foreground mx-auto max-w-6xl px-4 py-4 text-xs">{copy.disclaimer}</p>
      </footer>
    </div>
  );
}
