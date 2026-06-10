import { usePrivy } from "@privy-io/react-auth";
import { Megaphone, ShieldCheck, Twitter, Zap } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { Link } from "wouter";
import { ThemeToggle } from "@/components/theme-toggle";
import { HeroCanvas } from "@/components/hero-canvas";

interface Feature {
  icon: typeof Zap;
  tag: string;
  title: string;
  description: string;
}

const features: Feature[] = [
  {
    icon: Zap,
    tag: "FAST",
    title: "Instant Tips",
    description:
      "Sub-second finality on Somnia Network. Hit send, the recipient sees it before the toast fades.",
  },
  {
    icon: ShieldCheck,
    tag: "ESCROW",
    title: "Zero Friction",
    description:
      "Tip anyone with a Twitter handle. If they're not registered yet, funds wait safely in escrow.",
  },
  {
    icon: Megaphone,
    tag: "VIRAL",
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
    <div className="min-h-screen bg-background font-mono text-foreground">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="shrink-0">
            <img src="/xenia.png" alt="Xenia" className="h-9 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {authenticated ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Open app <span aria-hidden="true">&rarr;</span>
              </Link>
            ) : (
              <button
                type="button"
                disabled={!ready}
                onClick={() => login()}
                className="inline-flex items-center gap-2 bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Twitter className="h-4 w-4" aria-hidden="true" />
                Get started
              </button>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* Hero — ASCII canvas backdrop + Ruthie wordmark */}
        <section className="relative flex min-h-[80vh] flex-col items-center justify-center overflow-hidden px-6 py-24">
          <HeroCanvas />

          <span className="relative z-10 mb-8 inline-flex items-center gap-2 border border-primary/40 px-3 py-1 text-xs text-primary">
            <span className="h-1.5 w-1.5 bg-primary" />
            LIVE ON SOMNIA TESTNET
          </span>

          <img
            src="/xenia.png"
            alt="Xenia"
            className="relative z-10 mb-6 h-20 w-auto md:h-28"
          />

          <p className="relative z-10 mb-2 max-w-xl text-center text-lg text-foreground md:text-xl">
            tip the post, not the platform.
          </p>
          <p className="relative z-10 mb-10 max-w-xl text-center text-sm text-muted-foreground">
            {"// instant, near-zero-fee tips on Somnia. no wallet? funds wait in escrow until they claim."}
          </p>

          <div className="relative z-10 flex flex-col items-center gap-3 sm:flex-row">
            <button
              type="button"
              disabled={!ready}
              onClick={() => login()}
              className="inline-flex min-w-[220px] items-center justify-center gap-2 bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Twitter className="h-4 w-4" aria-hidden="true" />
              Get started
            </button>
            <button
              type="button"
              onClick={scrollToFeatures}
              className="inline-flex min-w-[220px] items-center justify-center border border-border px-6 py-3 text-sm text-foreground transition-colors hover:bg-secondary"
            >
              Learn more
            </button>
          </div>
        </section>

        <section
          ref={featuresRef}
          id="features"
          className="border-t border-border bg-secondary/40 py-20"
          aria-labelledby="features-heading"
        >
          <div className="mx-auto max-w-6xl px-6">
            <div className="mb-4 text-sm tracking-wide text-muted-foreground">{"// FEATURES"}</div>
            <h2 id="features-heading" className="mb-12 text-2xl font-bold text-primary">
              Built for the next billion tippers
            </h2>

            <div className="grid gap-6 md:grid-cols-3">
              {features.map((f) => (
                <FeatureCard
                  key={f.title}
                  icon={<f.icon className="h-5 w-5" aria-hidden="true" />}
                  tag={f.tag}
                  title={f.title}
                >
                  {f.description}
                </FeatureCard>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-10">
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
  tag: string;
  title: string;
  children: ReactNode;
}

function FeatureCard({ icon, tag, title, children }: FeatureCardProps) {
  return (
    <div className="border border-border bg-card p-6 transition-colors hover:bg-accent">
      <div className="mb-4 flex items-center justify-between">
        <span className="flex h-10 w-10 items-center justify-center bg-primary text-primary-foreground">
          {icon}
        </span>
        <span className="text-xs text-muted-foreground">[{tag}]</span>
      </div>
      <h3 className="text-lg font-bold text-primary">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
