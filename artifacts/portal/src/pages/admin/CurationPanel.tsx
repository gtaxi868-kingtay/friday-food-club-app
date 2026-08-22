/**
 * Curation & Spotlight
 *
 * Lets admins pin specific drops to the top of the buyer feed with a gold
 * "Admin Find" badge. Featured drops are sorted first in GET /api/drops.
 */
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@workspace/convex-backend/convex/_generated/api";
import { useSession } from "@/components/SessionProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Star, StarOff, Loader2, Sparkles, Crown } from "lucide-react";

interface AdminDrop {
  id: string;
  title: string;
  mealSlot: string;
  status: string;
  price: number;
  chefId: string;
  chefName: string;
  currentOrders: number;
  inventory: number;
  expiresAt: string;
  isFeatured: boolean;
}

const STATUS_STYLE: Record<string, string> = {
  ACTIVE:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  SOLD_OUT:  "bg-orange-500/10 text-orange-400 border-orange-500/20",
  EXPIRED:   "bg-secondary     text-muted-foreground border-border",
  CANCELLED: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function CurationPanel() {
  const { toast } = useToast();
  const { token } = useSession();
  const sessionToken = token ?? "";

  const rawDrops = useQuery(api.admin.listDrops, token ? { sessionToken } : "skip");
  const isLoading = rawDrops === undefined;
  const drops: AdminDrop[] = (rawDrops?.drops ?? []).map((d: any) => ({
    id: d._id, title: d.title, mealSlot: d.mealSlot, status: d.status, price: d.price,
    chefId: d.chefId, chefName: d.chefName, currentOrders: d.currentOrders, inventory: d.inventory,
    expiresAt: new Date(d.expiresAt).toISOString(), isFeatured: !!d.isFeatured,
  }));

  const toggleMutation = useMutation(api.admin.toggleFeatured);
  const [isPending, setIsPending] = useState(false);

  const toggle = async (id: string) => {
    setIsPending(true);
    try {
      const result = await toggleMutation({ sessionToken, dropId: id as any });
      toast({
        title: result.isFeatured ? "Pinned as Admin Find ✦" : "Removed from Spotlight",
        description: result.isFeatured
          ? "This drop now appears at the top of the buyer feed with a gold badge."
          : "Drop has been removed from the Admin Finds spotlight.",
      });
    } catch {
      toast({ title: "Failed", description: "Could not update featured status.", variant: "destructive" });
    } finally {
      setIsPending(false);
    }
  };

  const featured   = drops.filter(d => d.isFeatured);
  const unfeatured = drops.filter(d => !d.isFeatured);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Curation &amp; Spotlight</h1>
          <p className="text-muted-foreground mt-1">
            Pin elite drops to the top of the buyer feed. Featured plates get a gold{" "}
            <span className="text-primary font-medium">Admin Find</span> badge and priority placement.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-1">
          <div className="text-right">
            <p className="text-2xl font-serif font-bold text-primary">{featured.length}</p>
            <p className="text-xs text-muted-foreground">pinned</p>
          </div>
          <div className="w-10 h-10 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Crown className="w-5 h-5 text-primary" />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-16">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : drops.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-10">

          {/* Pinned */}
          {featured.length > 0 && (
            <section>
              <SectionLabel icon={<Sparkles className="w-3.5 h-3.5 text-primary" />} label="Currently Pinned — Admin Finds" gold />
              <DropGrid drops={featured} onToggle={toggle} isPending={isPending} />
            </section>
          )}

          {/* All others */}
          <section>
            <SectionLabel
              label={featured.length > 0 ? `All Other Drops (${unfeatured.length})` : `All Drops (${drops.length})`}
            />
            {unfeatured.length === 0 ? (
              <p className="text-sm text-muted-foreground px-1">All drops are currently pinned.</p>
            ) : (
              <DropGrid drops={unfeatured} onToggle={toggle} isPending={isPending} />
            )}
          </section>

        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ icon, label, gold }: { icon?: React.ReactNode; label: string; gold?: boolean }) {
  return (
    <div className={`flex items-center gap-2 mb-4 pb-2 border-b ${gold ? "border-primary/20" : "border-border"}`}>
      {icon}
      <span className={`text-xs font-semibold uppercase tracking-widest ${gold ? "text-primary" : "text-muted-foreground"}`}>
        {label}
      </span>
    </div>
  );
}

function DropGrid({ drops, onToggle, isPending }: { drops: AdminDrop[]; onToggle: (id: string) => void; isPending: boolean }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {drops.map(d => <DropCard key={d.id} drop={d} onToggle={onToggle} isPending={isPending} />)}
    </div>
  );
}

function DropCard({ drop, onToggle, isPending }: { drop: AdminDrop; onToggle: (id: string) => void; isPending: boolean }) {
  const featured = drop.isFeatured;

  return (
    <Card className={`bg-card transition-all duration-200 ${
      featured
        ? "border-primary/50 shadow-[0_0_0_1px_hsl(var(--primary)/0.25),0_8px_32px_hsl(var(--primary)/0.06)]"
        : "border-card-border hover:border-border/80"
    }`}>
      <CardContent className="p-5 flex flex-col gap-4">

        {/* Top row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {featured && (
              <div className="flex items-center gap-1.5 mb-1.5">
                <Sparkles className="w-3 h-3 text-primary" />
                <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Admin Find</span>
              </div>
            )}
            <h3 className="font-serif font-semibold text-sm text-foreground leading-snug line-clamp-2">
              {drop.title}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{drop.chefName} · {drop.mealSlot}</p>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold shrink-0 ${STATUS_STYLE[drop.status] ?? STATUS_STYLE.COMPLETED}`}>
            {drop.status}
          </span>
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between text-xs text-muted-foreground bg-secondary/30 rounded-md px-3 py-2">
          <span className="font-mono">TTD {drop.price?.toFixed(2)}</span>
          <span>{drop.currentOrders}/{drop.inventory} orders</span>
        </div>

        {/* Action */}
        <Button
          size="sm"
          variant="ghost"
          className={`w-full text-xs font-medium h-8 ${
            featured
              ? "border border-primary/30 text-primary hover:bg-primary/10"
              : "border border-border text-muted-foreground hover:text-primary hover:border-primary/30 hover:bg-primary/5"
          }`}
          onClick={() => onToggle(drop.id)}
          disabled={isPending}
        >
          {featured
            ? <><StarOff className="w-3.5 h-3.5 mr-1.5" />Remove from Spotlight</>
            : <><Star   className="w-3.5 h-3.5 mr-1.5" />Pin as Admin Find</>
          }
        </Button>

      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
        <Crown className="w-8 h-8 text-muted-foreground opacity-30" />
      </div>
      <h3 className="font-serif text-lg font-semibold text-foreground mb-2">No drops to curate yet</h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        Once chefs post drops they'll appear here. Pin the best plates to give them editorial spotlight in the buyer feed.
      </p>
    </div>
  );
}
