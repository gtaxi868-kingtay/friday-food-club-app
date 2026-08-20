import { Link } from "wouter";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground text-center px-4">
      <AlertCircle className="w-16 h-16 text-destructive mb-6 opacity-80" />
      <h1 className="text-4xl font-serif font-bold mb-4">404 - Area Restricted</h1>
      <p className="text-muted-foreground max-w-md mb-8">
        The page you're looking for doesn't exist or you don't have clearance to view it.
      </p>
      <Link href="/">
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
          Return to Base
        </Button>
      </Link>
    </div>
  );
}
