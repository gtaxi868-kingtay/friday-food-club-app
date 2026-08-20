import { useState, Fragment } from "react";
import {
  useListAdminChefs,
  useVerifyChef,
  useRejectChef,
  useGetPlatformConfig,
  useAdminCreditChefWallet,
  getListAdminChefsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Check, X, ShieldCheck, User, ExternalLink,
  FileImage, IdCard, Clock, AlertTriangle, Wallet, ChevronDown, ChevronUp, CreditCard,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type CreditEntry = {
  amount?: number | null;
  note?: string | null;
  createdAt?: string | null;
};

type AdminChef = {
  id?: string;
  name?: string;
  handle?: string;
  cuisine?: string;
  region?: string;
  isVerified?: boolean;
  verificationStatus?: string;
  foodBadgeUrl?: string | null;
  nationalIdUrl?: string | null;
  rejectionReason?: string | null;
  submittedAt?: string | null;
  totalDrops?: number;
  walletBalance?: number | null;
  lastAdminCredit?: string | null;
  lastAdminCreditNote?: string | null;
  creditHistory?: CreditEntry[];
};

type WalletForm = { amount: string; note: string; idempotencyKey: string };

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtCurrency(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-TT", {
    style: "currency",
    currency: "TTD",
    minimumFractionDigits: 2,
  }).format(n);
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-TT", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-TT", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Wallet Badge ──────────────────────────────────────────────────────────────
function WalletBadge({
  balance,
  freezeThreshold,
}: {
  balance: number | null | undefined;
  freezeThreshold: number;
}) {
  if (balance == null) return <span className="text-muted-foreground text-xs">—</span>;
  const frozen = balance <= freezeThreshold;
  return (
    <span
      className={[
        "inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded-full border",
        frozen
          ? "bg-destructive/10 border-destructive/30 text-destructive"
          : balance < 0
          ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-600"
          : "bg-emerald-500/10 border-emerald-500/30 text-emerald-700",
      ].join(" ")}
    >
      <Wallet className="w-3 h-3" />
      {fmtCurrency(balance)}
      {frozen && " ❄️"}
    </span>
  );
}

// ── Credit Ledger ─────────────────────────────────────────────────────────────
function CreditLedger({ credits }: { credits: CreditEntry[] }) {
  const [open, setOpen] = useState(false);
  if (credits.length === 0) return <span className="text-muted-foreground text-xs">No credits yet</span>;

  return (
    <div className="space-y-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-xs text-primary hover:underline"
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {credits.length} credit{credits.length !== 1 ? "s" : ""}
      </button>
      {open && (
        <div className="mt-1 rounded-md border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-secondary/60">
              <tr>
                <th className="px-2 py-1 text-left text-muted-foreground font-medium">Date</th>
                <th className="px-2 py-1 text-right text-muted-foreground font-medium">Amount</th>
                <th className="px-2 py-1 text-left text-muted-foreground font-medium">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {credits.map((cr, i) => (
                <tr key={i} className="bg-card">
                  <td className="px-2 py-1 whitespace-nowrap">{fmtDateTime(cr.createdAt)}</td>
                  <td className="px-2 py-1 text-right font-mono text-emerald-700">{fmtCurrency(cr.amount)}</td>
                  <td className="px-2 py-1 text-muted-foreground max-w-[160px] truncate" title={cr.note ?? undefined}>
                    {cr.note || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Doc Preview ───────────────────────────────────────────────────────────────
function DocPreview({
  label,
  url,
  icon: Icon,
}: {
  label: string;
  url: string | null | undefined;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const [open, setOpen] = useState(false);

  if (!url) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground italic">
        <Icon className="w-4 h-4 opacity-40" />
        {label}: Not uploaded
      </div>
    );
  }

  const isObjectPath = !url.startsWith("http");
  const viewUrl = isObjectPath ? `/api/storage/objects/${url.replace(/^\/objects\//, "")}` : url;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="w-4 h-4 text-muted-foreground" />
          {label}
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => setOpen(o => !o)}
          >
            {open ? "Hide" : "Preview"}
          </Button>
          <a href={viewUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5">
              <ExternalLink className="w-3 h-3" /> Open
            </Button>
          </a>
        </div>
      </div>
      {open && (
        <div className="rounded-lg overflow-hidden border border-border bg-secondary/20">
          <img
            src={viewUrl}
            alt={label}
            className="w-full max-h-72 object-contain"
            onError={e => {
              (e.target as HTMLImageElement).style.display = "none";
              (e.target as HTMLImageElement).insertAdjacentHTML(
                "afterend",
                `<div class="p-8 text-center text-sm text-muted-foreground">Could not load preview — <a href="${viewUrl}" target="_blank" class="underline">open directly</a></div>`
              );
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── Pending Chef Card ─────────────────────────────────────────────────────────
function PendingCard({
  chef,
  freezeThreshold,
  onVerify,
  onReject,
  isPending,
}: {
  chef: AdminChef;
  freezeThreshold: number;
  onVerify: (id: string) => void;
  onReject: (id: string, reason: string) => void;
  isPending: boolean;
}) {
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");
  const credits = chef.creditHistory ?? [];

  return (
    <Card className="bg-card border-card-border overflow-hidden">
      <div className="h-1 bg-primary" />
      <CardContent className="p-6 space-y-5">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center border border-border shrink-0">
              <User className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">{chef.name}</h3>
              <p className="text-sm text-muted-foreground">{chef.handle}</p>
            </div>
          </div>
          <Badge variant="outline" className="bg-background text-xs shrink-0">
            <Clock className="w-3 h-3 mr-1" /> PENDING
          </Badge>
        </div>

        {/* Details */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <span className="text-muted-foreground">Cuisine</span>
          <span className="font-medium">{chef.cuisine || "—"}</span>
          <span className="text-muted-foreground">Region</span>
          <span className="font-medium">{chef.region || "—"}</span>
          {chef.submittedAt && (
            <>
              <span className="text-muted-foreground">Submitted</span>
              <span className="font-medium">{fmtDate(chef.submittedAt)}</span>
            </>
          )}
          <span className="text-muted-foreground">Wallet</span>
          <span className="font-medium">
            <WalletBadge balance={chef.walletBalance} freezeThreshold={freezeThreshold} />
          </span>
          {credits.length > 0 && (
            <>
              <span className="text-muted-foreground pt-1">Credits</span>
              <div className="pt-1"><CreditLedger credits={credits} /></div>
            </>
          )}
        </div>

        {/* Document previews */}
        <div className="space-y-4 p-4 rounded-lg bg-secondary/20 border border-border">
          <DocPreview label="Food Badge" url={chef.foodBadgeUrl} icon={FileImage} />
          <div className="border-t border-border/50" />
          <DocPreview label="National ID" url={chef.nationalIdUrl} icon={IdCard} />
        </div>

        {/* Approve */}
        {!showReject && (
          <div className="flex gap-3">
            <Button
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => onVerify(chef.id!)}
              disabled={isPending}
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
              Approve
            </Button>
            <Button
              variant="outline"
              className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10"
              onClick={() => setShowReject(true)}
              disabled={isPending}
            >
              <X className="w-4 h-4 mr-2" /> Reject
            </Button>
          </div>
        )}

        {/* Reject panel */}
        {showReject && (
          <div className="space-y-3 border border-destructive/25 rounded-lg p-4 bg-destructive/5">
            <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <AlertTriangle className="w-4 h-4" /> Rejection Reason
            </div>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Food Badge image is blurry and text is unreadable. Please resubmit a clear photo."
              className="min-h-[80px] text-sm resize-none bg-background border-border"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">{reason.length}/500 — shown to the chef</p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                className="flex-1"
                onClick={() => onReject(chef.id!, reason)}
                disabled={isPending}
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <X className="w-4 h-4 mr-2" />}
                Confirm Reject
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setShowReject(false); setReason(""); }}
                disabled={isPending}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ChefVerification() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: chefsData, isLoading } = useListAdminChefs({
    query: { queryKey: getListAdminChefsQueryKey() },
  });

  // Platform config provides the configurable freeze threshold
  const { data: platformConfig } = useGetPlatformConfig();
  const freezeThreshold = platformConfig?.walletFreezeThreshold ?? -50;

  const { mutate: verifyChef, isPending: verifying } = useVerifyChef();
  const { mutate: rejectChef, isPending: rejecting } = useRejectChef();
  const { mutate: creditWallet } = useAdminCreditChefWallet();

  // Per-chef inline credit form state
  const [walletForms, setWalletForms] = useState<Record<string, WalletForm>>({});
  const [openCreditId, setOpenCreditId] = useState<string | null>(null);
  const [creditingChefId, setCreditingChefId] = useState<string | null>(null);

  const getWalletForm = (chefId: string): WalletForm =>
    walletForms[chefId] ?? { amount: "", note: "", idempotencyKey: crypto.randomUUID() };

  const setWalletForm = (chefId: string, patch: Partial<WalletForm>) =>
    setWalletForms(prev => ({ ...prev, [chefId]: { ...getWalletForm(chefId), ...patch } }));

  const toggleCreditForm = (chef: AdminChef) => {
    if (openCreditId === chef.id) {
      setOpenCreditId(null);
    } else {
      setOpenCreditId(chef.id!);
      // Generate a fresh idempotency key each time the form is opened so that a
      // new submission cannot accidentally reuse the key from a prior session.
      const freshKey = crypto.randomUUID();
      // Pre-fill the deficit when balance is negative
      const balance = chef.walletBalance ?? 0;
      const currentForm = getWalletForm(chef.id!);
      setWalletForm(chef.id!, {
        idempotencyKey: freshKey,
        amount: !currentForm.amount && balance < 0 ? Math.abs(balance).toFixed(2) : currentForm.amount,
      });
    }
  };

  const handleWalletCredit = (chef: AdminChef) => {
    const form = getWalletForm(chef.id!);
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) {
      toast({ title: "Invalid Amount", description: "Enter a positive credit amount.", variant: "destructive" });
      return;
    }
    setCreditingChefId(chef.id!);
    creditWallet(
      { id: chef.id!, data: { amount, note: form.note || undefined, idempotencyKey: form.idempotencyKey } },
      {
        onSuccess: (data: any) => {
          queryClient.invalidateQueries({ queryKey: getListAdminChefsQueryKey() });
          // Reset form with a fresh idempotency key so a subsequent open cannot
          // replay the same key against the server's 60-second cache.
          setWalletForms(prev => ({ ...prev, [chef.id!]: { amount: "", note: "", idempotencyKey: crypto.randomUUID() } }));
          setOpenCreditId(null);
          toast({
            title: "Wallet Credited ✓",
            description: `${chef.name}'s new balance is ${fmtCurrency(data.newWalletBalance)}.`,
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

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListAdminChefsQueryKey() });

  const handleVerify = (id: string) => {
    verifyChef(
      { id },
      {
        onSuccess: (data: any) => {
          invalidate();
          const notified = data?.notificationSent === true;
          toast({
            title: "Chef Verified ✓",
            description: notified
              ? "Creator account is now active. Push notification queued to chef's device."
              : "Creator account is now active.",
          });
        },
        onError: () => toast({ title: "Error", description: "Verification failed.", variant: "destructive" }),
      }
    );
  };

  const handleReject = (id: string, reason: string) => {
    rejectChef(
      { id, data: { reason: reason.trim() || undefined } } as any,
      {
        onSuccess: (data: any) => {
          invalidate();
          const notified = data?.notificationSent === true;
          toast({
            title: "Application Rejected",
            description: notified
              ? "Application rejected. Push notification queued to chef's device."
              : "Application rejected.",
            variant: "destructive",
          });
        },
        onError: () => toast({ title: "Error", description: "Rejection failed.", variant: "destructive" }),
      }
    );
  };

  const chefs = (chefsData?.chefs ?? []) as AdminChef[];
  const pendingChefs  = chefs.filter(c => c.verificationStatus === "PENDING_REVIEW" || (!c.verificationStatus && !c.isVerified));
  const rejectedChefs = chefs.filter(c => c.verificationStatus === "REJECTED");
  const verifiedChefs = chefs.filter(c => c.verificationStatus === "VERIFIED" || (c.isVerified && c.verificationStatus !== "REJECTED"));

  return (
    <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in duration-500 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Chef Verification</h1>
          <p className="text-muted-foreground">Review food badge certifications and ID documents.</p>
        </div>
        <div className="px-4 py-2 bg-secondary rounded-lg border border-border flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <span className="text-sm font-medium">{chefsData?.pendingVerification || 0} Pending</span>
        </div>
      </div>

      {/* Pending Applications */}
      <section className="space-y-5">
        <h2 className="text-xl font-serif font-semibold border-b border-border pb-2">
          Pending Applications
          {pendingChefs.length > 0 && (
            <span className="ml-3 text-sm font-normal text-primary">{pendingChefs.length} to review</span>
          )}
        </h2>

        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : pendingChefs.length === 0 ? (
          <div className="text-center p-12 bg-card border border-dashed border-border rounded-xl">
            <ShieldCheck className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">Queue is empty. All caught up.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingChefs.map(chef => (
              <PendingCard
                key={chef.id}
                chef={chef}
                freezeThreshold={freezeThreshold}
                onVerify={handleVerify}
                onReject={handleReject}
                isPending={verifying || rejecting}
              />
            ))}
          </div>
        )}
      </section>

      {/* Rejected */}
      {!isLoading && rejectedChefs.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-serif font-semibold border-b border-border pb-2 text-muted-foreground">
            Recently Rejected
          </h2>
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-secondary/50 border-b border-border">
                <tr>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Name</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Handle</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Wallet</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Reason</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rejectedChefs.map(chef => (
                  <tr key={chef.id} className="hover:bg-secondary/20 transition-colors align-top">
                    <td className="px-6 py-4 font-medium">{chef.name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{chef.handle}</td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <WalletBadge balance={chef.walletBalance} freezeThreshold={freezeThreshold} />
                        <CreditLedger credits={chef.creditHistory ?? []} />
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground text-xs max-w-xs truncate">
                      {chef.rejectionReason || "—"}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant="outline" className="border-destructive/30 text-destructive text-xs">
                        REJECTED
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Verified roster */}
      <section className="space-y-4">
        <h2 className="text-xl font-serif font-semibold border-b border-border pb-2">Verified Creators</h2>
        {isLoading ? null : verifiedChefs.length === 0 ? (
          <div className="text-sm text-muted-foreground">No verified chefs yet.</div>
        ) : (
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-secondary/50 border-b border-border">
                <tr>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Name</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Handle</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Region</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Drops</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Wallet</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Credit History</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {verifiedChefs.map(chef => {
                  const isFrozen = typeof chef.walletBalance === "number" && chef.walletBalance <= freezeThreshold;
                  const isOpen = openCreditId === chef.id;
                  const form = getWalletForm(chef.id!);
                  const isSubmitting = creditingChefId === chef.id;

                  return (
                    <Fragment key={chef.id}>
                      {/* Chef row */}
                      <tr
                        className={[
                          "transition-colors align-top",
                          isFrozen ? "bg-destructive/5 hover:bg-destructive/10" : "hover:bg-secondary/20",
                        ].join(" ")}
                      >
                        <td className="px-6 py-4 font-medium">
                          <div className="flex items-center gap-2">
                            {chef.name}
                            {isFrozen && (
                              <span title="Wallet frozen — balance below threshold">❄️</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">{chef.handle}</td>
                        <td className="px-6 py-4 text-muted-foreground">{chef.region || "—"}</td>
                        <td className="px-6 py-4">{chef.totalDrops || 0}</td>
                        <td className="px-6 py-4">
                          <WalletBadge balance={chef.walletBalance} freezeThreshold={freezeThreshold} />
                        </td>
                        <td className="px-6 py-4">
                          <CreditLedger credits={chef.creditHistory ?? []} />
                        </td>
                        <td className="px-6 py-4">
                          <Badge className="bg-primary/10 text-primary border-none shadow-none">
                            <ShieldCheck className="w-3 h-3 mr-1" /> VERIFIED
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <Button
                            size="sm"
                            variant="outline"
                            className={[
                              "h-7 text-xs gap-1.5 shrink-0",
                              isFrozen
                                ? "border-destructive/40 text-destructive hover:bg-destructive/10"
                                : "",
                            ].join(" ")}
                            onClick={() => toggleCreditForm(chef)}
                          >
                            <CreditCard className="w-3 h-3" />
                            {isFrozen ? "Settle ❄️" : "Credit Wallet"}
                          </Button>
                        </td>
                      </tr>

                      {/* Inline credit form — expands below the chef row */}
                      {isOpen && (
                        <tr className="bg-primary/5">
                          <td colSpan={8} className="px-6 py-4 border-t border-primary/10">
                            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">
                                  Amount (TTD)
                                  {typeof chef.walletBalance === "number" && chef.walletBalance < 0 && (
                                    <span className="ml-2 text-destructive font-normal">
                                      — deficit: {fmtCurrency(Math.abs(chef.walletBalance))}
                                    </span>
                                  )}
                                </label>
                                <div className="relative w-40">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                                    TTD
                                  </span>
                                  <Input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={form.amount}
                                    onChange={e => setWalletForm(chef.id!, { amount: e.target.value })}
                                    className="pl-10 bg-background text-sm h-8"
                                    disabled={isSubmitting}
                                    autoFocus
                                  />
                                </div>
                              </div>
                              <div className="flex-1 space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Note (optional)</label>
                                <Input
                                  type="text"
                                  placeholder="e.g. Settlement for October drops"
                                  value={form.note}
                                  onChange={e => setWalletForm(chef.id!, { note: e.target.value })}
                                  className="bg-background text-sm h-8 max-w-xs"
                                  disabled={isSubmitting}
                                />
                              </div>
                              <div className="flex gap-2 shrink-0">
                                <Button
                                  size="sm"
                                  className="h-8 bg-primary text-primary-foreground hover:bg-primary/90"
                                  onClick={() => handleWalletCredit(chef)}
                                  disabled={isSubmitting || !form.amount || parseFloat(form.amount) <= 0}
                                >
                                  {isSubmitting
                                    ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                    : <Check className="w-3 h-3 mr-1" />}
                                  Apply Credit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 text-muted-foreground"
                                  onClick={() => setOpenCreditId(null)}
                                  disabled={isSubmitting}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
