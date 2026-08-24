import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/convex-backend/convex/_generated/api";
import { useSession } from "@/components/SessionProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ClipboardList, ChefHat, Users } from "lucide-react";

export default function WaitlistPanel() {
  const { token } = useSession();
  const sessionToken = token ?? "";
  const rows = useQuery(api.waitlist.list, token ? { sessionToken } : "skip");
  const isLoading = !!token && rows === undefined;
  const [filter, setFilter] = useState<"ALL" | "BUYER" | "CHEF">("ALL");

  const all = rows ?? [];
  const buyers = all.filter((r) => r.role === "BUYER");
  const chefs = all.filter((r) => r.role === "CHEF");
  const shown = filter === "ALL" ? all : filter === "BUYER" ? buyers : chefs;

  const fmtDate = (ms: number) =>
    new Date(ms).toLocaleDateString("en-TT", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 pb-12">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-primary" />
          Waitlist
        </h1>
        <p className="text-muted-foreground mt-1">
          Everyone who asked to be notified before launch — buyers and chefs, from the public landing page.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total", value: all.length, key: "ALL" as const },
          { label: "Buyers", value: buyers.length, key: "BUYER" as const },
          { label: "Chefs & Vendors", value: chefs.length, key: "CHEF" as const },
        ].map((kpi) => (
          <button
            key={kpi.key}
            onClick={() => setFilter(kpi.key)}
            className={`rounded-xl border px-5 py-4 text-left transition-colors ${
              filter === kpi.key ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-secondary/30"
            }`}
          >
            <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-widest">{kpi.label}</p>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center p-16">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 flex flex-col items-center justify-center py-20 gap-3 text-center">
          <Users className="w-10 h-10 text-muted-foreground/40" />
          <p className="font-semibold text-foreground">No one yet</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Signups from the public landing page will show up here.
          </p>
        </div>
      ) : (
        <Card className="bg-card border-card-border">
          <CardContent className="p-0">
            <table className="w-full text-sm text-left">
              <thead className="bg-secondary/50 border-b border-border">
                <tr>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Name</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Contact</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Role</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Area</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((r) => (
                  <tr key={r._id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-6 py-4 font-medium">{r.name}</td>
                    <td className="px-6 py-4 font-mono text-xs text-muted-foreground">{r.contact}</td>
                    <td className="px-6 py-4">
                      <Badge variant="outline" className={r.role === "CHEF" ? "text-primary border-primary/30" : ""}>
                        {r.role === "CHEF" ? <ChefHat className="w-3 h-3 mr-1" /> : <Users className="w-3 h-3 mr-1" />}
                        {r.role === "CHEF" ? "Chef / Vendor" : "Buyer"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{r.area || "—"}</td>
                    <td className="px-6 py-4 text-muted-foreground text-xs whitespace-nowrap">{fmtDate(r._creationTime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
