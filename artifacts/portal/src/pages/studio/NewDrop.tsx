import { useState } from "react";
import { useSession } from "@/components/SessionProvider";
import { useMutation, useAction } from "convex/react";
import { api } from "@workspace/convex-backend/convex/_generated/api";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Wand2, ArrowLeft, Tags, Hash } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const dropSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  mealSlot: z.enum(["Breakfast", "Lunch", "Dinner"]),
  description: z.string().min(10, "Description is too short"),
  pickupLocation: z.string().min(3, "Pickup location is required"),
  price: z.coerce.number().min(1, "Price must be greater than 0"),
  inventory: z.coerce.number().min(1, "Inventory must be at least 1").max(500),
  minOrders: z.coerce.number().min(1, "Min orders must be at least 1"),
  expiresAt: z.string().min(1, "Expiry date is required"),
  tags: z.string().optional(),
});

export default function NewDrop() {
  const { user, token } = useSession();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [aiInput, setAiInput] = useState("");
  const [aiTone, setAiTone] = useState<"luxury" | "playful" | "street">("luxury");
  const [marketingContent, setMarketingContent] = useState<any>(null);

  const form = useForm<z.infer<typeof dropSchema>>({
    resolver: zodResolver(dropSchema),
    defaultValues: {
      title: "",
      mealSlot: "Dinner",
      description: "",
      pickupLocation: "",
      price: 0,
      inventory: 10,
      minOrders: 5,
      expiresAt: new Date(Date.now() + 86400000).toISOString().split('T')[0], // tomorrow
      tags: "",
    },
  });

  const createDropMutation = useMutation(api.drops.create);
  const [creating, setCreating] = useState(false);
  const marketingAction = useAction(api.ai.marketing);
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!aiInput.trim() || !token) return;
    setGenerating(true);
    try {
      const data = await marketingAction({
        sessionToken: token, rawDescription: aiInput, tone: aiTone,
        dishName: form.getValues('title'), isSecret: false,
      });
      setMarketingContent(data);
      toast({
        title: "Magic applied",
        description: "Marketing copy generated successfully.",
      });
    } catch {
      toast({
        title: "Generation Failed",
        description: "The AI assistant could not generate content right now.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const applyAiContent = () => {
    if (marketingContent?.suggestedTitle) form.setValue('title', marketingContent.suggestedTitle);
    if (marketingContent?.caption) form.setValue('description', marketingContent.caption);
    if (marketingContent?.hashtags?.length) form.setValue('tags', marketingContent.hashtags.join(', '));
  };

  const onSubmit = async (values: z.infer<typeof dropSchema>) => {
    if (!user?.chefId || !token) return;

    // Parse tags string to array
    const tagsArray = values.tags ? values.tags.split(',').map(t => t.trim()).filter(Boolean) : [];

    setCreating(true);
    try {
      await createDropMutation({
        sessionToken: token,
        chefId: user.chefId as any,
        title: values.title,
        mealSlot: values.mealSlot,
        description: values.description,
        pickupLocation: values.pickupLocation,
        price: values.price,
        inventory: values.inventory,
        minOrders: values.minOrders,
        expiresAt: new Date(values.expiresAt).getTime(),
        tags: tagsArray,
        imageIndex: Math.floor(Math.random() * 3) + 1, // Random image 1-3 for demo
      });
      toast({
        title: "Drop Launched",
        description: "Your drop is now live on the marketplace.",
      });
      setLocation("/studio");
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.data?.message ?? "Could not create drop. Please try again.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/studio")} className="rounded-full border border-border bg-card hover:bg-secondary">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Launch a Drop</h1>
          <p className="text-muted-foreground">Create a new offering for the Friday Food Club</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Card className="bg-card border-card-border shadow-lg overflow-hidden">
            <div className="h-2 bg-gradient-to-r from-primary/50 via-primary to-primary/50"></div>
            <CardHeader>
              <CardTitle className="font-serif">Drop Details</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form id="drop-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Dish Name / Drop Title</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. 24-Hour Smoked Brisket" {...field} className="bg-secondary/30" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="mealSlot"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Meal Slot</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-secondary/30">
                                <SelectValue placeholder="Select a slot" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Breakfast">Breakfast</SelectItem>
                              <SelectItem value="Lunch">Lunch</SelectItem>
                              <SelectItem value="Dinner">Dinner</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="price"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Price (TTD)</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="150" {...field} className="bg-secondary/30" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description & Story</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="What makes this dish special? Sell the sizzle..." 
                            className="h-32 bg-secondary/30 resize-none" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <FormField
                      control={form.control}
                      name="inventory"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Hard Limit (Plates)</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} className="bg-secondary/30" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="minOrders"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Min to Unlock</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} className="bg-secondary/30" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="expiresAt"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Drop Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} className="bg-secondary/30" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="pickupLocation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Secret Pickup Location</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. The alley behind Queen's Park Oval (exact details given after purchase)" {...field} className="bg-secondary/30" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="tags"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tags (comma separated)</FormLabel>
                        <FormControl>
                          <Input placeholder="spicy, vegan, exclusive" {...field} className="bg-secondary/30" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="pt-4 border-t border-border flex justify-end">
                    <Button type="submit" form="drop-form" disabled={creating} className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-6 text-lg shadow-[0_0_20px_rgba(212,175,55,0.3)]">
                      {creating && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                      Launch Drop to Network
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        {/* AI Assistant Sidebar */}
        <div className="space-y-6">
          <Card className="bg-secondary/20 border-primary/20 shadow-lg relative overflow-hidden">
            {/* Ambient glow */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl"></div>
            
            <CardHeader>
              <CardTitle className="flex items-center font-serif text-lg text-primary">
                <Wand2 className="w-4 h-4 mr-2" />
                AI Marketing Assistant
              </CardTitle>
              <CardDescription>
                Turn casual notes into hype-inducing copy.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 relative z-10">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase">What are you making?</label>
                <Textarea 
                  placeholder="making some stew pork with pigeon peas, proper trini style..."
                  className="h-24 bg-background/50 border-border text-sm resize-none"
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase">Vibe</label>
                <Select value={aiTone} onValueChange={(val: any) => setAiTone(val)}>
                  <SelectTrigger className="bg-background/50 border-border h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="luxury">Luxury / Prestige</SelectItem>
                    <SelectItem value="street">Street / Underground</SelectItem>
                    <SelectItem value="playful">Playful / Casual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button 
                onClick={handleGenerate} 
                disabled={generating || !aiInput.trim()}
                variant="outline"
                className="w-full border-primary/50 text-primary hover:bg-primary/10 hover:text-primary"
              >
                {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
                Generate Hype
              </Button>
            </CardContent>
          </Card>

          {marketingContent && (
            <Card className="bg-card border-primary/30 shadow-[0_0_15px_rgba(212,175,55,0.1)] animate-in slide-in-from-bottom-4">
              <CardHeader className="pb-3 border-b border-border">
                <CardTitle className="text-sm font-serif flex items-center justify-between">
                  Generated Result
                  <Button size="sm" variant="ghost" className="h-6 text-xs text-primary" onClick={applyAiContent}>
                    Apply to Form
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4 text-sm">
                {marketingContent.suggestedTitle && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase block mb-1">Suggested Title</span>
                    <p className="font-serif font-bold text-lg">{marketingContent.suggestedTitle}</p>
                  </div>
                )}
                {marketingContent.caption && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase block mb-1">Caption</span>
                    <p className="text-muted-foreground italic">"{marketingContent.caption}"</p>
                  </div>
                )}
                {marketingContent.adCopy && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase block mb-1">Ad Copy</span>
                    <p className="text-muted-foreground">{marketingContent.adCopy}</p>
                  </div>
                )}
                {marketingContent.hashtags && marketingContent.hashtags.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase block mb-1">Hashtags</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {marketingContent.hashtags.map((tag: string, i: number) => (
                        <span key={i} className="text-xs bg-secondary px-2 py-0.5 rounded text-primary flex items-center">
                          <Hash className="w-3 h-3 mr-0.5 opacity-50" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
