import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy";
import { requireMembership } from "@/lib/org";

// Home is the New audit page (upload-first layout, brief section 9).
// Phase 0 shows the shape; upload and audit arrive in Phase 1.
export default async function NewAuditPage() {
  const { supabase } = await requireMembership();
  const { data: recent } = await supabase
    .from("audits")
    .select("id, created_at, status")
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{copy.newAudit.title}</CardTitle>
          <CardDescription>{copy.newAudit.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="text-muted-foreground flex min-h-40 items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm">
            {copy.newAudit.comingSoon}
          </div>
          <div>
            <Button disabled>{copy.audit.runButton}</Button>
          </div>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">{copy.newAudit.recentAudits}</h2>
        {recent && recent.length > 0 ? (
          <ul className="text-sm">
            {recent.map((a) => (
              <li key={a.id}>{new Date(a.created_at).toLocaleDateString("en-AU")}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">{copy.newAudit.noRecentAudits}</p>
        )}
      </section>
    </div>
  );
}
