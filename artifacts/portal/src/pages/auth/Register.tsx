import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@workspace/convex-backend/convex/_generated/api";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { AuthShell } from "@/components/layout/AuthShell";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ChefHat } from "lucide-react";
import { useLocation } from "wouter";

// Portal accounts are always created as BUYER.
// Chefs must first register here, then apply through the Friday Food Club mobile app.
const registerSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export default function Register() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  const registerMutation = useMutation(api.auth.register);
  const [isPending, setIsPending] = useState(false);

  async function onSubmit(values: z.infer<typeof registerSchema>) {
    setIsPending(true);
    try {
      await registerMutation(values);
      toast({
        title: "Account created",
        description: "Sign in to access the portal.",
      });
      navigate("/login");
    } catch (err: any) {
      const message = err?.data?.message ?? err?.message ?? "An error occurred during registration.";
      toast({
        title: "Registration Failed",
        description: message,
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
          <h1 className="text-2xl font-serif font-bold tracking-tight">Create an Account</h1>
          <p className="text-sm text-muted-foreground">Join the Friday Food Club network</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" {...field} className="bg-secondary/50 border-secondary-foreground/10 focus-visible:ring-primary" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
              Create Account
            </Button>
          </form>
        </Form>

        {/* Chef application notice */}
        <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <ChefHat className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">Want to become a Chef?</span>{" "}
            Create your account here, then open the Friday Food Club mobile app to submit your
            Food Badge and ID for verification.
          </p>
        </div>

        <div className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline underline-offset-4">
            Sign in
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
