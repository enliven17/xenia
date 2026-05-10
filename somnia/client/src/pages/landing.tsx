import { usePrivy } from "@privy-io/react-auth";
import {
  ArrowRight,
  Megaphone,
  ShieldCheck,
  Sparkles,
  Twitter,
  Zap,
} from "lucide-react";
import { useRef, type ReactNode } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Feature {
  icon: typeof Zap;
  title: string;
  description: string;
}

const features: Feature[] = [
  {
    icon: Zap,
    title: "Instant Tips",
    description:
      "Sub-second finality on Somnia Network. Hit send, the recipient sees it before the toast fades.",
  },
  {
    icon: ShieldCheck,
    title: "Zero Friction",
    description:
      "Tip anyone with a Twitter handle. If they're not registered yet, funds wait safely in escrow.",
  },
  {
    icon: Megaphone,
    title: "Viral Tipping",
    description:
      "Our bot replies to recipients on X so they know there's a tip waiting. Onboarding becomes virality.",
  },
];

export default function LandingPage() {
  const { login, ready, authenticated } = usePrivy();
  const featuresRef = useRef<HTMLDivElement>(null);

  const scrollToFeatures = () => {
    featuresRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-violet-600 to-indigo-600 text-white">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </div>
            <span className="text-base font-semibold">Xenia</span>
          </Link>
          {authenticated ? (
            <Link href="/dashboard">
              <Button size="sm">
                Open app <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          ) : (
            <Button size="sm" disabled={!ready} onClick={() => login()}>
              <Twitter className="h-4 w-4" />
              Login with X
            </Button>
          )}
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute left-1/2 top-[-10%] h-[480px] w-[760px] -translate-x-1/2 rounded-full bg-violet-500/20 blur-3xl" />
            <div className="absolute right-[-10%] top-[20%] h-[320px] w-[420px] rounded-full bg-indigo-500/20 blur-3xl" />
          </div>

          <div className="mx-auto max-w-5xl px-6 py-24 text-center md:py-32">
            <span className="inline-flex items-center gap-2 rounded-full border bg-background/60 px-4 py-1 text-xs font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
              Live on Somnia testnet
            </span>
            <h1 className="mt-6 text-balance text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl lg:text-7xl">
              <span className="block">Tip anyone on X</span>
              <span className="block gradient-text-violet">at the speed of Somnia.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-base text-muted-foreground md:text-lg">
              Instant, near-zero fee tips via Somnia Network. No wallet? No problem &mdash; funds
              wait in escrow until the recipient claims them.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                size="lg"
                disabled={!ready}
                onClick={() => login()}
                className="min-w-[200px]"
              >
                <Twitter className="h-4 w-4" />
                Login with X
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={scrollToFeatures}
                className="min-w-[200px]"
              >
                Learn more
              </Button>
            </div>
          </div>
        </section>

        <section
          ref={featuresRef}
          id="features"
          className="border-t bg-muted/30 py-20"
          aria-labelledby="features-heading"
        >
          <div className="mx-auto max-w-6xl px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2
                id="features-heading"
                className="text-3xl font-bold tracking-tight md:text-4xl"
              >
                Built for the next billion tippers
              </h2>
              <p className="mt-4 text-muted-foreground">
                Three principles guide every interaction.
              </p>
            </div>

            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {features.map((f) => (
                <FeatureCard key={f.title} icon={<f.icon className="h-5 w-5" />} title={f.title}>
                  {f.description}
                </FeatureCard>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-muted-foreground md:flex-row">
          <span>Powered by Somnia Network</span>
          <nav aria-label="Legal" className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}

function FeatureCard({ icon, title, children }: FeatureCardProps) {
  return (
    <Card className="border-border/60 bg-background/60">
      <CardContent className="p-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gradient-to-br from-violet-600 to-indigo-600 text-white">
          {icon}
        </div>
        <h3 className="mt-4 text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{children}</p>
      </CardContent>
    </Card>
  );
}
