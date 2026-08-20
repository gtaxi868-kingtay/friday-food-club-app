import { useSession } from "@/components/SessionProvider";
import { useListDrops, useGetChefWallet, getListDropsQueryKey, getGetChefWalletQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Plus, Wallet, TrendingUp, Clock, Package, CheckCircle2, AlertTriangle, Banknote, XCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export default function StudioDashboard() {
  const { user } = useSession();
  const chefId = user?.chefId || "";

  const { data: dropsData, isLoading: dropsLoading } = useListDrops(
    { chefId },
    { query: { enabled: !!chefId, queryKey: getListDropsQueryKey({ chefId }) } }
  );

  const { data: walletData, isLoading: walletLoading } = useGetChefWallet(
    chefId,
    { query: { enabled: !!chefId, queryKey: getGetChefWalletQueryKey(chefId) } }
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-TT', { style: 'currency', currency: 'TTD' }).format(amount);
  };

  const verificationStatus = (user as any)?.chefVerificationStatus;
  const rejectionReason = (user as any)?.chefRejectionReason;

  // ── Verification gate screens ──────────────────────────────────────────────

  if (!user?.chefVerified) {
    if (verificationStatus === "REJECTED") {
      return (
        <div className="max-w-2xl mx-auto mt-12 space-y-6 animate-in fade-in duration-500">
          <div className="flex flex-col items-center text-center gap-6 p-8 rounded-2xl border border-destructive/30 bg-destructive/5">
            <div className="w-16 h-16 bg-destructive/10 border border-destructive/30 rounded-full flex items-center justify-center">
              <XCircle className="w-8 h-8 text-destructive" />
            </div>
            <div>
              <h2 className="text-2xl font-serif font-bold mb-3 text-destructive">Application Rejected</h2>
              {rejectionReason ? (
                <div className="mb-4 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-left">
                  <p className="text-xs font-semibold text-destructive/70 uppercase tracking-wider mb-1">Reason from admin</p>
                  <p className="text-sm text-foreground">{rejectionReason}</p>
                </div>
              ) : (
                <p className="text-muted-foreground mb-4">
                  Your creator application did not meet our requirements.
                </p>
              )}
              <p className="text-sm text-muted-foreground mb-6">
                You can update your documents and reapply. Ensure your Food Badge is valid and your ID is clearly legible.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              To reapply, use the Friday Food Club mobile app and submit a new application with updated documents.
            </p>
          </div>
        </div>
      );
    }

    // Default: PENDING_REVIEW or no status yet
    return (
      <div className="max-w-2xl mx-auto mt-12 animate-in fade-in duration-500">
        <div className="flex flex-col items-center text-center gap-6 p-8 rounded-2xl border border-border bg-card">
          <div className="relative">
            <div className="w-16 h-16 bg-secondary/50 border border-border rounded-full flex items-center justify-center">
              <Clock className="w-8 h-8 text-muted-foreground" />
            </div>
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
              <span className="w-2 h-2 rounded-full bg-background animate-pulse" />
            </span>
          </div>
          <div>
            <h2 className="text-2xl font-serif font-bold mb-3">Application Under Review</h2>
            <p className="text-muted-foreground leading-relaxed">
              Our team is reviewing your Food Badge certification and National ID.
              This typically takes <span className="text-foreground font-medium">1–3 business days</span>.
              You'll gain full access once approved.
            </p>
          </div>
          <div className="w-full p-4 rounded-lg bg-secondary/30 border border-border text-left space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">What happens next</p>
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <span>Documents verified → you'll be able to launch drops</span>
            </div>
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <XCircle className="w-4 h-4 text-muted-foreground/50 mt-0.5 shrink-0" />
              <span>If rejected, you'll see a reason and can reapply via the mobile app</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Verified chef dashboard ────────────────────────────────────────────────

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Creator Studio</h1>
          <p className="text-muted-foreground">Manage your drops, track inventory, and view earnings.</p>
        </div>
        <Link href="/studio/new">
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_15px_rgba(212,175,55,0.2)]">
            <Plus className="w-4 h-4 mr-2" />
            Launch New Drop
          </Button>
        </Link>
      </div>

      {/* Cash debt warning banner */}
      {!walletLoading && (walletData as any)?.isFrozen && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-destructive/50 bg-destructive/10">
          <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-destructive">Wallet Frozen — New Drops Blocked</p>
            <p className="text-xs text-muted-foreground mt-1">
              Your wallet is at {formatCurrency(walletData?.walletBalance || 0)} from unpaid cash platform fees.
              Once your balance is above {formatCurrency((walletData as any)?.freezeThreshold ?? -50)} you can post drops again.
              Contact admin to manually top up.
            </p>
          </div>
        </div>
      )}
      {!walletLoading && !((walletData as any)?.isFrozen) && (walletData?.walletBalance || 0) < 0 && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10">
          <Banknote className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-yellow-500">Cash Platform Fees Owed</p>
            <p className="text-xs text-muted-foreground mt-1">
              You owe {formatCurrency(Math.abs(walletData?.walletBalance || 0))} in platform fees from cash orders.
              Drops will be blocked once balance drops below {formatCurrency((walletData as any)?.freezeThreshold ?? -50)}.
            </p>
          </div>
        </div>
      )}

      {/* Wallet Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-card-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Wallet className="w-4 h-4" /> Wallet Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {walletLoading ? (
              <div className="h-8 w-24 bg-secondary animate-pulse rounded" />
            ) : (
              <p className={`text-2xl font-bold ${(walletData?.walletBalance || 0) < 0 ? 'text-destructive' : 'text-primary'}`}>
                {formatCurrency(walletData?.walletBalance || 0)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card border-card-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Total Earnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            {walletLoading ? (
              <div className="h-8 w-24 bg-secondary animate-pulse rounded" />
            ) : (
              <p className="text-2xl font-bold text-foreground">
                {formatCurrency((walletData as any)?.totalEarnings || 0)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card border-card-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Package className="w-4 h-4" /> Active Drops
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">
              {dropsLoading ? <span className="h-8 w-8 block bg-secondary animate-pulse rounded" /> : (dropsData?.drops?.filter(d => d.status === 'ACTIVE' || d.status === 'UNLOCKED').length || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      {!walletLoading && (walletData?.recentTransactions ?? (walletData as any)?.recentPayouts ?? []).length > 0 && (
        <Card className="bg-card border-card-border">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Recent Transactions</CardTitle>
            <CardDescription>Last {(walletData?.recentTransactions ?? (walletData as any)?.recentPayouts ?? []).length} payouts</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {(walletData?.recentTransactions ?? (walletData as any)?.recentPayouts ?? []).slice(0, 5).map((tx: any, i: number) => (
                <div key={i} className="flex items-center justify-between px-6 py-3">
                  <div>
                    <p className="text-sm font-medium">{tx.dropTitle || 'Drop'}</p>
                    <p className="text-xs text-muted-foreground">{tx.paymentMethod} · {tx.fulfilledAt ? new Date(tx.fulfilledAt).toLocaleDateString('en-TT') : '—'}</p>
                  </div>
                  <p className={`text-sm font-bold ${(tx.walletEffect ?? tx.chefShare ?? 0) >= 0 ? 'text-green-500' : 'text-destructive'}`}>
                    {(tx.walletEffect ?? tx.chefShare ?? 0) >= 0 ? '+' : ''}{formatCurrency(tx.walletEffect ?? tx.chefShare ?? 0)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Drops */}
      <div>
        <h2 className="text-xl font-serif font-semibold mb-4 border-b border-border pb-2">Your Drops</h2>
        {dropsLoading ? (
          <div className="flex justify-center p-12"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>
        ) : !dropsData?.drops?.length ? (
          <div className="text-center p-12 bg-card border border-dashed border-border rounded-xl">
            <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">No drops yet. Launch your first secret menu.</p>
            <Link href="/studio/new">
              <Button variant="outline" className="mt-4">
                <Plus className="w-4 h-4 mr-2" /> Create Drop
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {dropsData.drops.map(drop => (
              <Card key={drop.id} className="bg-card border-card-border overflow-hidden">
                <div className={`h-1 ${drop.status === 'UNLOCKED' ? 'bg-green-500' : drop.status === 'SOLD_OUT' ? 'bg-yellow-500' : drop.status === 'CANCELLED' ? 'bg-destructive' : 'bg-primary'}`} />
                <CardContent className="p-5">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-bold text-sm leading-tight">{drop.title}</h3>
                    <Badge variant="outline" className={`text-xs shrink-0 ml-2 ${drop.status === 'UNLOCKED' ? 'border-green-500/40 text-green-400' : drop.status === 'SOLD_OUT' ? 'border-yellow-500/40 text-yellow-400' : ''}`}>
                      {drop.status}
                    </Badge>
                  </div>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>{drop.mealSlot}</span>
                      <span className="font-semibold text-foreground">TTD {drop.price}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Orders</span>
                      <span>{drop.currentOrders} / {drop.minOrders} min</span>
                    </div>
                    <Progress value={(drop.currentOrders / (drop.inventory || 1)) * 100} className="h-1" />
                    <div className="flex justify-between">
                      <span>Inventory</span>
                      <span>{drop.remaining} left of {drop.inventory}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
