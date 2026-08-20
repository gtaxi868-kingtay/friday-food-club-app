import { useState } from "react";
import { useLogin, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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

  const queryClient = useQueryClient();
  const { mutate: login, isPending } = useLogin();

  function onSubmit(values: z.infer<typeof loginSchema>) {
    login(
      { data: values },
      {
        onSuccess: (data) => {
          // Populate the session cache immediately so ProtectedRoute sees the
          // authenticated user without waiting for a /api/auth/me round-trip.
          // Without this, the pre-login 401 stays cached (retry: false) and
          // ProtectedRoute redirects back to /login even after a valid login.
          if (data?.user) {
            queryClient.setQueryData(getGetMeQueryKey(), { user: data.user });
          }
          if (data?.user?.role === "CHEF") {
            setLocation("/studio");
          } else if (data?.user?.role === "ADMIN") {
            setLocation("/admin");
          } else {
            toast({
              title: "Access Denied",
              description: "Buyers must use the mobile app.",
              variant: "destructive",
            });
          }
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error ?? "Check your credentials and try again.";
          toast({
            title: "Login Failed",
            description: msg,
            variant: "destructive",
          });
        },
      }
    );
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
