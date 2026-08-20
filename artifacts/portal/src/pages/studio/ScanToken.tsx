import { useState } from "react";
import { useSession } from "@/components/SessionProvider";
import { useVerifyPickup } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Camera, QrCode, CheckCircle2, Banknote } from "lucide-react";
import { FulfillmentResult } from "@workspace/api-client-react";

export default function ScanToken() {
  const { user } = useSession();
  const { toast } = useToast();
  const [token, setToken] = useState("");
  const [result, setResult] = useState<FulfillmentResult | null>(null);

  const { mutate: verifyPickup, isPending } = useVerifyPickup();

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim() || !user?.chefId) return;

    verifyPickup(
      { data: { pickupToken: token.trim(), chefId: user.chefId } },
      {
        onSuccess: (data) => {
          setResult(data);
          setToken("");
          const isCash = (data as any).paymentMethod === 'CASH';
          toast({
            title: "Verification Successful",
            description: isCash
              ? "Cash order confirmed. Platform fee debited from your wallet."
              : "Pickup confirmed. Escrow has been released to your wallet.",
          });
        },
        onError: () => {
          toast({
            title: "Verification Failed",
            description: "Invalid or already used token.",
            variant: "destructive",
          });
          setResult(null);
        }
      }
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-TT', { style: 'currency', currency: 'TTD' }).format(amount);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-500 pb-12">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground">Verify Pickup</h1>
        <p className="text-muted-foreground">Scan or enter the buyer's token to release escrow.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="bg-card border-card-border shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Camera className="w-5 h-5 mr-2" />
              Token Entry
            </CardTitle>
            <CardDescription>Enter the FFC token provided by the buyer</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleVerify} className="space-y-6">
              <div className="space-y-2">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <QrCode className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <Input 
                    placeholder="FFC-XXXXXXXX-XXXX" 
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="pl-10 h-14 text-lg font-mono tracking-widest bg-secondary/30 uppercase"
                  />
                </div>
              </div>
              <Button 
                type="submit" 
                disabled={isPending || !token.trim()} 
                className="w-full h-12 text-lg bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isPending ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                Verify & Release Funds
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Result Area */}
        <div className="relative">
          {result ? (() => {
            const isCash = (result as any).paymentMethod === 'CASH';
            return (
              <Card className="bg-card border-primary/50 shadow-[0_0_30px_rgba(212,175,55,0.15)] animate-in zoom-in-95 duration-300">
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center space-y-4">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isCash ? 'bg-yellow-500/20' : 'bg-primary/20'}`}>
                      {isCash
                        ? <Banknote className="w-10 h-10 text-yellow-500" />
                        : <CheckCircle2 className="w-10 h-10 text-primary" />}
                    </div>
                    
                    <div>
                      <h2 className="text-2xl font-serif font-bold text-foreground">
                        {isCash ? 'Cash Collected' : 'Escrow Released'}
                      </h2>
                      <p className="text-primary font-medium">{result.dropTitle}</p>
                      {isCash && (
                        <p className="text-xs text-muted-foreground mt-1">Cash order — platform fee debited from wallet</p>
                      )}
                    </div>
                    
                    <div className="w-full border-t border-b border-border py-4 my-4">
                      {isCash && (
                        <div className="flex justify-between text-sm mb-2 text-muted-foreground">
                          <span>Cash Collected (gross)</span>
                          <span>{formatCurrency((result as any).cashCollected || result.gross || 0)}</span>
                        </div>
                      )}
                      {!isCash && (
                        <div className="flex justify-between text-sm mb-2 text-muted-foreground">
                          <span>Order Gross</span>
                          <span>{formatCurrency(result.gross || 0)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm mb-2 text-muted-foreground">
                        <span>Platform Fee (10%)</span>
                        <span className="text-destructive">-{formatCurrency(result.platformShare || 0)}</span>
                      </div>
                      <div className="flex justify-between text-lg font-bold mt-4">
                        <span>{isCash ? 'Your Net Share' : 'Your Share'}</span>
                        <span className="text-primary">+{formatCurrency(result.chefShare || 0)}</span>
                      </div>
                      {isCash && (
                        <p className="text-xs text-muted-foreground mt-2 text-center">
                          Fee debited from your wallet · you keep the cash
                        </p>
                      )}
                    </div>
                    
                    <div className="text-sm text-muted-foreground">
                      New Wallet Balance:{" "}
                      <span className={`font-mono font-medium ${(result.chefWalletBalance || 0) < 0 ? 'text-destructive' : 'text-foreground'}`}>
                        {formatCurrency(result.chefWalletBalance || 0)}
                      </span>
                    </div>
                    
                    <Button variant="outline" className="w-full mt-4" onClick={() => setResult(null)}>
                      Scan Another Token
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })() : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-border rounded-xl opacity-50">
              <QrCode className="w-16 h-16 text-muted-foreground mb-4 opacity-50" />
              <p className="text-muted-foreground max-w-[200px]">Waiting for token verification to show payout details.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
