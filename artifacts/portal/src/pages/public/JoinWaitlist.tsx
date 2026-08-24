import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@workspace/convex-backend/convex/_generated/api";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, ChefHat, Users, Lock, PartyPopper } from "lucide-react";

// Public, unauthenticated — this is the page the landing page / WhatsApp
// links actually point people to so a signup lands as a real row in the
// `waitlist` table (visible to admins in the portal), not just a chat
// thread. No session, no account creation, no PII shown back to the visitor.
const waitlistSchema = z.object({
  name: z.string().min(2, "Enter your name"),
  contact: z.string().min(5, "Enter a phone number or email"),
  role: z.enum(["BUYER", "CHEF"]),
  area: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof waitlistSchema>;

export default function JoinWaitlist() {
  const [submitted, setSubmitted] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const join = useMutation(api.waitlist.join);

  const form = useForm<FormValues>({
    resolver: zodResolver(waitlistSchema),
    defaultValues: { name: "", contact: "", role: "BUYER", area: "", notes: "" },
  });

  const role = form.watch("role");

  async function onSubmit(values: FormValues) {
    setIsPending(true);
    try {
      await join({
        name: values.name,
        contact: values.contact,
        role: values.role,
        area: values.area || undefined,
        notes: values.notes || undefined,
      });
      setSubmitted(true);
    } catch (err: any) {
      form.setError("root", {
        message: err?.data?.message ?? err?.message ?? "Something went wrong. Try again.",
      });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-primary mb-3">
            <Lock className="w-3 h-3" /> Before we open the doors
          </div>
          <h1 className="text-3xl font-serif font-bold gold-gradient-text">Friday Food Club</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Trinidad &amp; Tobago's secret Friday food-drop network. Get word the moment it's live.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-lg">
          {submitted ? (
            <div className="flex flex-col items-center text-center py-8 gap-3">
              <PartyPopper className="w-10 h-10 text-primary" />
              <p className="font-semibold text-foreground text-lg">You're on the list</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                We'll reach out the moment there's a drop — or real demand — near you.
              </p>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => form.setValue("role", "BUYER")}
                    className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium transition-colors ${
                      role === "BUYER" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary/50"
                    }`}
                  >
                    <Users className="w-4 h-4" /> I want to eat
                  </button>
                  <button
                    type="button"
                    onClick={() => form.setValue("role", "CHEF")}
                    className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium transition-colors ${
                      role === "CHEF" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary/50"
                    }`}
                  >
                    <ChefHat className="w-4 h-4" /> I cook / bake
                  </button>
                </div>

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Your name" {...field} className="bg-secondary/50 border-secondary-foreground/10 focus-visible:ring-primary" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contact"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone or email</FormLabel>
                      <FormControl>
                        <Input placeholder="868 000 0000 or you@email.com" {...field} className="bg-secondary/50 border-secondary-foreground/10 focus-visible:ring-primary" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="area"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Area <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <FormControl>
                        <Input placeholder="Port of Spain, San Fernando…" {...field} className="bg-secondary/50 border-secondary-foreground/10 focus-visible:ring-primary" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {role === "CHEF" && (
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>What do you make? <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                        <FormControl>
                          <Textarea placeholder="Home cooking, pastry, bakes, confections…" {...field} className="bg-secondary/50 border-secondary-foreground/10 focus-visible:ring-primary" rows={2} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {form.formState.errors.root && (
                  <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
                )}

                <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90" disabled={isPending}>
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Join the waitlist
                </Button>
              </form>
            </Form>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6 font-mono uppercase tracking-widest">
          We only use this to tell you about drops. Nothing else, ever.
        </p>
      </div>
    </div>
  );
}
