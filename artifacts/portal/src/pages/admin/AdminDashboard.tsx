import { useState } from "react";
import { 
  useGetAdminStats, 
  useGetEscrowLedger, 
  useListAdminDrops,
  useListAdminChefs,
  useOverrideDropStatus,
  useGetPlatformConfig,
  useUpdatePlatformConfig,
  useAdminCreditChefWallet,
  getGetAdminStatsQueryKey,
  getGetEscrowLedgerQueryKey,
  getListAdminDropsQueryKey,
  getGetPlatformConfigQueryKey,
  getListAdminChefsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Activity, Landmark, TrendingUp, Users, Package, Save, Loader2, DollarSign, Banknote, Wallet, AlertTriangle, UserPlus, MapPin, Copy, CheckCircle, Crown } from "lucide-react";

// ── Per-chef wallet form state ─────────────────────────────────────────────────
type WalletForm = { amount: string; note: string };

export default function AdminDashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: stats, isLoading: statsLoading } = useGetAdminStats({ query: { queryKey: getGetAdminStatsQueryKey() } });
  const { data: ledger, isLoading: ledgerLoading } = useGetEscrowLedger({ query: { queryKey: getGetEscrowLedgerQueryKey() } });
  const { data: dropsData, isLoading: dropsLoading } = useListAdminDrops({}, { query: { queryKey: getListAdminDropsQueryKey({}) } });
  const { data: config, isLoading: configLoading } = useGetPlatformConfig({ query: { queryKey: getGetPlatformConfigQueryKey() } });
  const { data: chefsData, isLoading: chefsLoading } = useListAdminChefs({ query: { queryKey: getListAdminChefsQueryKey() } });

  const { mutate: updateStatus } = useOverrideDropStatus();
  const { mutate: updateConfig, isPending: configUpdating } = useUpdatePlatformConfig();
  const { mutate: creditWallet, isPending: walletCrediting } = useAdminCreditChefWallet();

  const [feeRate, setFeeRate] = useState<string>("");
  const [passPrice, setPassPrice] = useState<string>("");
  const [freezeThreshold, setFreezeThreshold] = useState<string>("");
  const [walletForms, setWalletForms] = useState<Record<string, WalletForm>>({});
  const [creditingChefId, setCreditingChefId] = useState<string | null>(null);

  // Add Creator modal
  const [showAddChef, setShowAddChef] = useState(false);
  const [addChefForm, setAddChefForm] = useState({ name: "", kitchenName: "", area: "", email: "", cuisine: "" });
  const [addChefLoading, setAddChefLoading] = useState(false);
  const [createdCreds, setCreatedCreds] = useState<{ email: string; tempPassword: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Regional coverage
  const { data: coverageData } = useQuery({
    queryKey: ["admin", "coverage"],
    queryFn: async (): Promise<{ regions: Array<{ region: string; activeChefs: number; liveDrops: number }> }> => {
      const res = await fetch("/api/admin/coverage");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  // Sync config inputs when loaded
  if (config && !feeRate && !passPrice) {
    setFeeRate((config.platformFeeRate * 100).toString());
    setPassPrice(config.clubPassPrice.toString());
    setFreezeThreshold(((config as any).walletFreezeThreshold ?? -50).toString());
  }

  const formatCurrency = (amount: number | undefined) => {
    if (amount === undefined) return '...';
    return new Intl.NumberFormat('en-TT', { style: 'currency', currency: 'TTD' }).format(amount);
  };

  const formatNumber = (num: number | undefined) => {
    if (num === undefined) return '...';
    return new Intl.NumberFormat('en-US').format(num);
  };

  const handleStatusChange = (dropId: string, newStatus: string) => {
    updateStatus(
      { id: dropId, data: { status: newStatus as any } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAdminDropsQueryKey({}) });
          toast({ title: "Status Updated", description: "Drop status overridden successfully." });
        }
      }
    );
  };

  const handleConfigSave = () => {
    updateConfig(
      {
        data: {
          platformFeeRate: parseFloat(feeRate) / 100,
          clubPassPrice: parseFloat(passPrice),
          walletFreezeThreshold: parseFloat(freezeThreshold),
        } as any
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetPlatformConfigQueryKey() });
          toast({ title: "Config Saved", description: "Platform settings updated." });
        }
      }
    );
  };

  const getWalletForm = (chefId: string): WalletForm =>
    walletForms[chefId] ?? { amount: "", note: "" };

  const setWalletForm = (chefId: string, patch: Partial<WalletForm>) => {
    setWalletForms(prev => ({
      ...prev,
      [chefId]: { ...getWalletForm(chefId), ...patch },
    }));
  };

  const handleWalletCredit = (chefId: string, chefName: string) => {
    const form = getWalletForm(chefId);
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) {
      toast({ title: "Invalid Amount", description: "Enter a positive credit amount.", variant: "destructive" });
      return;
    }
    setCreditingChefId(chefId);
    creditWallet(
      { id: chefId, data: { amount, note: form.note || undefined } },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getListAdminChefsQueryKey() });
          setWalletForms(prev => ({ ...prev, [chefId]: { amount: "", note: "" } }));
          toast({
            title: "Wallet Credited",
            description: `${chefName}'s balance is now ${formatCurrency(data.newWalletBalance)}.`,
          });
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error ?? "Failed to credit wallet.";
          toast({ title: "Credit Failed", description: msg, variant: "destructive" });
        },
        onSettled: () => setCreditingChefId(null),
      }
    );
  };

  // Add Creator handler
  const handleAddChef = async () => {
    if (!addChefForm.name || !addChefForm.area || !addChefForm.email) {
      toast({ title: "Missing Fields", description: "Name, area, and email are required.", variant: "destructive" });
      return;
    }
    setAddChefLoading(true);
    try {
      const res = await fetch("/api/admin/chefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addChefForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setCreatedCreds({ email: data.email, tempPassword: data.tempPassword });
      queryClient.invalidateQueries({ queryKey: getListAdminChefsQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["admin", "coverage"] });
      toast({ title: "Creator Added ✓", description: `${addChefForm.name} is now a verified chef on the platform.` });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setAddChefLoading(false);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const freezeThresholdValue = (config as any)?.walletFreezeThreshold ?? -50;
  const frozenChefs = (chefsData?.chefs ?? []).filter(
    (c) => typeof (c as any).walletBalance === "number" && (c as any).walletBalance < 0
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Control Room</h1>
          <p className="text-muted-foreground">Platform overview, escrow ledger, and configuration.</p>
        </div>
        <Button
          onClick={() => { setShowAddChef(true); setCreatedCreds(null); setAddChefForm({ name: "", kitchenName: "", area: "", email: "", cuisine: "" }); }}
          className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 mt-1"
        >
          <UserPlus className="w-4 h-4 mr-2" />
          Add Creator
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-card-border">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Revenue</p>
                <h3 className="text-2xl font-serif font-bold mt-2">{formatCurrency(stats?.platform?.platformRevenue)}</h3>
              </div>
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                <Landmark className="w-4 h-4 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-card-border">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Escrow Holding</p>
                <h3 className="text-2xl font-serif font-bold mt-2">{formatCurrency(ledger?.heldInEscrow)}</h3>
              </div>
              <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center border border-border">
                <Activity className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-card-border">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Club Pass MRR</p>
                <h3 className="text-2xl font-serif font-bold mt-2 text-primary">{formatCurrency(stats?.platform?.subscriptions?.monthlyRevenue)}</h3>
              </div>
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-primary" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{formatNumber(stats?.platform?.subscriptions?.active)} active members</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-card-border">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Users</p>
                <h3 className="text-2xl font-serif font-bold mt-2">{formatNumber(stats?.platform?.totalUsers)}</h3>
              </div>
              <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center border border-border">
                <Users className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{formatNumber(stats?.platform?.verifiedChefs)} verified creators</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Regional Coverage ─────────────────────────────────────────────────── */}
      <Card className="bg-card border-card-border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            <CardTitle className="font-serif">Regional Coverage — Trinidad &amp; Tobago</CardTitle>
          </div>
          <CardDescription>Active verified chefs and live drops per area right now.</CardDescription>
        </CardHeader>
        <CardContent>
          {!coverageData ? (
            <div className="flex justify-center p-6">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : coverageData.regions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No verified chefs yet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {coverageData.regions.map((r) => (
                <div key={r.region} className="flex flex-col gap-1.5 p-3 rounded-lg bg-secondary/30 border border-border/60">
                  <p className="text-xs font-semibold text-foreground leading-tight">{r.region}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-serif font-bold text-primary">{r.activeChefs}</span>
                    <span className="text-[10px] text-muted-foreground">chefs</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className={`w-1.5 h-1.5 rounded-full ${r.liveDrops > 0 ? "bg-emerald-400" : "bg-muted-foreground/30"}`} />
                    <span className="text-[10px] text-muted-foreground">{r.liveDrops} live {r.liveDrops === 1 ? "drop" : "drops"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Wallet Settlement ─────────────────────────────────────────────────── */}
      <Card className="bg-card border-card-border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            <CardTitle className="font-serif">Wallet Settlement</CardTitle>
          </div>
          <CardDescription>
            Manually credit a chef's wallet to clear a frozen balance (threshold: {formatCurrency(freezeThresholdValue)}).
            Chefs below this balance cannot post new drops.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chefsLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : frozenChefs.length === 0 ? (
            <div className="flex items-center gap-3 py-6 text-center text-muted-foreground justify-center">
              <Wallet className="w-5 h-5 opacity-40" />
              <span className="text-sm">No chefs with a negative balance right now.</span>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {frozenChefs.map((chef) => {
                const walletBalance = (chef as any).walletBalance as number;
                const isFrozen = walletBalance <= freezeThresholdValue;
                const form = getWalletForm(chef.id!);
                const isSubmitting = creditingChefId === chef.id;

                return (
                  <div key={chef.id} className="py-4 flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* Chef info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{chef.name}</span>
                        {isFrozen && (
                          <Badge variant="destructive" className="text-xs flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Frozen
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{chef.handle}</div>
                      <div className={`text-sm font-mono mt-1 font-semibold ${walletBalance < 0 ? "text-destructive" : "text-foreground"}`}>
                        Balance: {formatCurrency(walletBalance)}
                      </div>
                    </div>

                    {/* Credit form */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">TTD</span>
                        <Input
                          type="number"
                          min="0.01"
                          step="0.01"
                          placeholder="0.00"
                          value={form.amount}
                          onChange={(e) => setWalletForm(chef.id!, { amount: e.target.value })}
                          className="bg-secondary/30 w-28 pl-10 text-sm"
                          disabled={isSubmitting}
                        />
                      </div>
                      <Input
                        type="text"
                        placeholder="Note (optional)"
                        value={form.note}
                        onChange={(e) => setWalletForm(chef.id!, { note: e.target.value })}
                        className="bg-secondary/30 w-40 text-sm"
                        disabled={isSubmitting}
                      />
                      <Button
                        size="sm"
                        onClick={() => handleWalletCredit(chef.id!, chef.name ?? "Chef")}
                        disabled={isSubmitting || !form.amount || parseFloat(form.amount) <= 0}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
                      >
                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Credit"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Ledger & Config */}
        <div className="space-y-8">
          <Card className="bg-card border-card-border">
            <CardHeader>
              <CardTitle className="font-serif">Escrow Ledger</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Digital */}
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                <DollarSign className="w-3 h-3" /> Digital Escrow
              </p>
              <div className="flex justify-between items-center py-1.5 border-b border-border/50">
                <span className="text-muted-foreground text-sm">Held in Escrow</span>
                <span className="font-mono font-medium text-sm">{formatCurrency(ledger?.heldInEscrow)}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-border/50">
                <span className="text-muted-foreground text-sm">Chef Payouts (released)</span>
                <span className="font-mono font-medium text-sm">{formatCurrency(ledger?.totalChefPayouts)}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-border">
                <span className="text-muted-foreground text-sm">Platform Fees (digital)</span>
                <span className="font-mono font-medium text-sm text-primary">{formatCurrency((ledger as any)?.digital?.totalPlatformRevenue)}</span>
              </div>
              {/* Cash */}
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 pt-2">
                <Banknote className="w-3 h-3" /> Cash on Pickup
              </p>
              <div className="flex justify-between items-center py-1.5 border-b border-border/50">
                <span className="text-muted-foreground text-sm">Cash Pending Reconciliation</span>
                <span className="font-mono font-medium text-sm">{formatNumber((ledger as any)?.cash?.ordersAwaitingPickup)} orders</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-border/50">
                <span className="text-muted-foreground text-sm">Total Cash Collected</span>
                <span className="font-mono font-medium text-sm">{formatCurrency((ledger as any)?.cash?.totalCashCollected)}</span>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-muted-foreground text-sm">Platform Fees (cash)</span>
                <span className="font-mono font-medium text-sm text-primary">{formatCurrency((ledger as any)?.cash?.totalPlatformFees)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-card-border">
            <CardHeader>
              <CardTitle className="font-serif">Platform Config</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {configLoading ? <div className="text-center text-sm text-muted-foreground">Loading...</div> : (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Platform Fee (%)</label>
                    <div className="flex space-x-2">
                      <Input 
                        type="number" 
                        value={feeRate} 
                        onChange={(e) => setFeeRate(e.target.value)} 
                        className="bg-secondary/30 w-full"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Club Pass Price (TTD/mo)</label>
                    <Input 
                      type="number" 
                      value={passPrice} 
                      onChange={(e) => setPassPrice(e.target.value)} 
                      className="bg-secondary/30"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Wallet Freeze Threshold (TTD)</label>
                    <Input 
                      type="number" 
                      value={freezeThreshold}
                      onChange={(e) => setFreezeThreshold(e.target.value)} 
                      className="bg-secondary/30"
                      placeholder="-50"
                    />
                    <p className="text-xs text-muted-foreground">Must be ≤ 0. Chefs below this balance cannot post drops.</p>
                  </div>
                  <Button 
                    onClick={handleConfigSave} 
                    disabled={configUpdating} 
                    className="w-full bg-secondary hover:bg-secondary/80 text-foreground"
                  >
                    {configUpdating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Save Changes
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Drops Override */}
        <div className="lg:col-span-2">
          <Card className="bg-card border-card-border h-full flex flex-col">
            <CardHeader>
              <CardTitle className="font-serif flex items-center">
                <Package className="w-5 h-5 mr-2" />
                Active Drops Override
              </CardTitle>
              <CardDescription>Force status changes in emergency scenarios</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
              {dropsLoading ? (
                <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
              ) : dropsData?.drops?.length === 0 ? (
                <div className="text-center text-muted-foreground p-8">No drops found.</div>
              ) : (
                <div className="space-y-4">
                  {dropsData?.drops?.map((drop) => (
                    <div key={drop.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-secondary/10 rounded-lg border border-border">
                      <div className="mb-4 sm:mb-0">
                        <div className="font-medium text-foreground">{drop.title}</div>
                        <div className="text-xs text-muted-foreground">Chef: {drop.chefName} • {formatCurrency(drop.price)}</div>
                        <div className="text-xs text-muted-foreground mt-1">Orders: {drop.currentOrders}/{drop.inventory}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-background">{drop.status}</Badge>
                        <Select 
                          value={drop.status} 
                          onValueChange={(val) => handleStatusChange(drop.id!, val)}
                        >
                          <SelectTrigger className="w-[140px] h-8 text-xs bg-background">
                            <SelectValue placeholder="Override" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                            <SelectItem value="UNLOCKED">UNLOCKED</SelectItem>
                            <SelectItem value="SOLD_OUT">SOLD_OUT</SelectItem>
                            <SelectItem value="COMPLETED">COMPLETED</SelectItem>
                            <SelectItem value="CANCELLED">CANCELLED</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Add Creator Dialog ───────────────────────────────────────────────── */}
      <Dialog open={showAddChef} onOpenChange={(open) => { if (!open) { setShowAddChef(false); setCreatedCreds(null); } }}>
        <DialogContent className="bg-card border-card-border max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                <Crown className="w-4 h-4 text-primary" />
              </div>
              <DialogTitle className="font-serif text-xl">Add Creator</DialogTitle>
            </div>
            <DialogDescription>
              Onboard a chef directly with <span className="text-primary font-medium">Verified</span> status,
              bypassing the mobile application queue.
            </DialogDescription>
          </DialogHeader>

          {createdCreds ? (
            /* ── Success: show credentials ── */
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-emerald-400">Chef account created</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Share these one-time credentials with the chef. They should change their password after first login.
                </p>
                {[
                  { label: "Email", value: createdCreds.email, field: "email" },
                  { label: "Temp Password", value: createdCreds.tempPassword, field: "pass" },
                ].map(({ label, value, field }) => (
                  <div key={field} className="mb-2">
                    <p className="text-xs text-muted-foreground mb-1">{label}</p>
                    <div className="flex items-center gap-2 bg-secondary/50 rounded-md px-3 py-2">
                      <code className="text-sm flex-1 font-mono text-foreground break-all">{value}</code>
                      <button
                        onClick={() => copyToClipboard(value, field)}
                        className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                      >
                        {copiedField === field
                          ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                          : <Copy className="w-3.5 h-3.5" />
                        }
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => { setCreatedCreds(null); setAddChefForm({ name: "", kitchenName: "", area: "", email: "", cuisine: "" }); }}
              >
                Add Another Creator
              </Button>
              <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setShowAddChef(false)}>
                Done
              </Button>
            </div>
          ) : (
            /* ── Form ── */
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">Full Name <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder="e.g. Marcus James"
                    value={addChefForm.name}
                    onChange={(e) => setAddChefForm(f => ({ ...f, name: e.target.value }))}
                    className="bg-secondary/30 h-9 text-sm"
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">Kitchen / Brand Name</Label>
                  <Input
                    placeholder="e.g. Trini Bites (defaults to full name)"
                    value={addChefForm.kitchenName}
                    onChange={(e) => setAddChefForm(f => ({ ...f, kitchenName: e.target.value }))}
                    className="bg-secondary/30 h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Email <span className="text-destructive">*</span></Label>
                  <Input
                    type="email"
                    placeholder="chef@example.com"
                    value={addChefForm.email}
                    onChange={(e) => setAddChefForm(f => ({ ...f, email: e.target.value }))}
                    className="bg-secondary/30 h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Area <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder="e.g. Woodbrook"
                    value={addChefForm.area}
                    onChange={(e) => setAddChefForm(f => ({ ...f, area: e.target.value }))}
                    className="bg-secondary/30 h-9 text-sm"
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">Cuisine Style</Label>
                  <Input
                    placeholder="e.g. Caribbean, Indian-Trinidadian, Street Food"
                    value={addChefForm.cuisine}
                    onChange={(e) => setAddChefForm(f => ({ ...f, cuisine: e.target.value }))}
                    className="bg-secondary/30 h-9 text-sm"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                A secure temporary password will be generated automatically. The chef logs in with it and can change it from their profile.
              </p>
              <Button
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handleAddChef}
                disabled={addChefLoading}
              >
                {addChefLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
                Create Verified Chef Account
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
