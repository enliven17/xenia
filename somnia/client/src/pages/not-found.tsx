import { Link } from "wouter";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center p-6">
      <div className="text-8xl font-bold text-muted-foreground/20">404</div>
      <h1 className="text-2xl font-bold">Page Not Found</h1>
      <p className="text-muted-foreground max-w-sm">
        The page you're looking for doesn't exist.
      </p>
      <Link href="/">
        <a className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors">
          <Home className="h-4 w-4" />
          Go Home
        </a>
      </Link>
    </div>
  );
}
