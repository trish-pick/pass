import { copy } from "@/lib/copy";
import { requireMembership } from "@/lib/org";

export default async function ProjectsPage() {
  const { supabase } = await requireMembership();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, project_number, address")
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{copy.projects.title}</h1>

      {projects && projects.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">{copy.projects.columns.number}</th>
                <th className="px-4 py-2 font-medium">{copy.projects.columns.name}</th>
                <th className="px-4 py-2 font-medium">{copy.projects.columns.address}</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-2">{p.project_number}</td>
                  <td className="px-4 py-2">{p.name}</td>
                  <td className="px-4 py-2">{p.address}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed px-6 py-16 text-center">
          <p className="font-medium">{copy.projects.empty}</p>
          <p className="text-muted-foreground text-sm">{copy.projects.emptyHint}</p>
        </div>
      )}
    </div>
  );
}
