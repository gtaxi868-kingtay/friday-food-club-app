import { useState } from "react";
import { useSession } from "@/components/SessionProvider";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { AuthShell } from "@/components/layout/AuthShell";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const { login } = useSession();
  const [isPending, setIsPending] = useState(false);

  async function onSubmit(values: z.infer<typeof loginSchema>) {
    setIsPending(true);
    try {
      const { user } = await login(values.email, values.password);
      if (user?.role === "CHEF") {
        setLocation("/studio");
      } else if (user?.role === "ADMIN") {
        setLocation("/admin");
      } else {
        toast({
          title: "Access Denied",
          description: "Buyers must use the mobile app.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      const msg = err?.data?.message ?? err?.message ?? "Check your credentials and try again.";
      toast({
        title: "Login Failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <AuthShell>
      <div className="flex flex-col space-y-6">
        <div className="flex flex-col space-y-2 text-center lg:text-left">
          <h1 className="text-2xl font-serif font-bold tracking-tight">Access Portal</h1>
          <p className="text-sm text-muted-foreground">Enter your credentials to continue</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input placeholder="name@example.com" {...field} className="bg-secondary/50 border-secondary-foreground/10 focus-visible:ring-primary" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} className="bg-secondary/50 border-secondary-foreground/10 focus-visible:ring-primary" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
          </form>
        </Form>

        <div className="text-center text-sm text-muted-foreground">
          Don't have an account?{" "}
          <Link href="/register" className="text-primary hover:underline underline-offset-4">
            Apply for access
          </Link>
        </div>

      </div>
    </AuthShell>
  );
}
