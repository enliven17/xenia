import { usePrivy } from "@privy-io/react-auth";
import { Megaphone, ShieldCheck, Twitter, Zap } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { Link } from "wouter";
import { ThemeToggle } from "@/components/theme-toggle";
import SoftAurora from "@/components/SoftAurora";

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
            <span className="font-ruthie text-4xl leading-none text-primary">
              Xenia
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/docs"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Docs
            </Link>
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
        {/* Hero — soft aurora backdrop + slogan headline */}
        <section className="relative flex min-h-[80vh] flex-col items-center justify-center overflow-hidden px-6 py-24">
          <div className="absolute inset-0 z-0" aria-hidden="true">
            <SoftAurora
              color1="#F5AFAF"
              color2="#9b5de5"
              brightness={0.85}
              speed={0.5}
            />
          </div>

          <span className="relative z-10 mb-8 inline-flex items-center gap-2 border border-primary/40 px-3 py-1 text-xs text-primary">
            <span className="h-1.5 w-1.5 bg-primary" />
            LIVE ON SOMNIA TESTNET
          </span>

          <h1 className="relative z-10 mb-6 max-w-3xl text-center text-4xl font-bold leading-tight tracking-tight md:text-6xl">
            Every post on <span className="text-primary">X</span>, now{" "}
            <span className="text-primary">tippable.</span>
          </h1>

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

        {/* How it works — flow diagram */}
        <section className="border-t border-border py-20" aria-labelledby="how-heading">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mb-4 text-sm tracking-wide text-muted-foreground">{"// HOW IT WORKS"}</div>
            <h2 id="how-heading" className="mb-3 text-2xl font-bold text-primary">
              From tweet to wallet, in one tap
            </h2>
            <p className="mb-10 max-w-2xl text-sm text-muted-foreground">
              Your wallet signs the tip directly. If the recipient is on Xenia, funds land instantly;
              if not, they wait safely in escrow until a one-click claim.
            </p>

            <div className="overflow-x-auto">
              <svg viewBox="0 0 980 300" role="img" aria-label="How Xenia works" className="h-auto w-full min-w-[760px]">
                <defs>
                  <marker id="lp-ar" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
                    <path d="M0,0 L7,3 L0,6 Z" fill="hsl(var(--primary))" />
                  </marker>
                </defs>

                {/* Row 1 — Mode A */}
                <text x="8" y="22" fontFamily="monospace" fontSize="12" fill="hsl(var(--muted-foreground))">{"// direct tip"}</text>

                <rect x="8" y="34" width="180" height="56" fill="hsl(var(--card))" stroke="hsl(var(--border))" />
                <text x="98" y="60" textAnchor="middle" fontFamily="monospace" fontSize="13" fill="hsl(var(--foreground))">Open a tweet</text>
                <text x="98" y="78" textAnchor="middle" fontFamily="monospace" fontSize="11" fill="hsl(var(--muted-foreground))">or profile on X</text>

                <line x1="190" y1="62" x2="224" y2="62" stroke="hsl(var(--primary))" strokeWidth="1.5" markerEnd="url(#lp-ar)" />

                <rect x="228" y="34" width="150" height="56" fill="hsl(var(--card))" stroke="hsl(var(--border))" />
                <text x="303" y="66" textAnchor="middle" fontFamily="monospace" fontSize="13" fill="hsl(var(--foreground))">Tip @user</text>

                <line x1="380" y1="62" x2="414" y2="62" stroke="hsl(var(--primary))" strokeWidth="1.5" markerEnd="url(#lp-ar)" />

                <rect x="418" y="34" width="210" height="56" fill="hsl(var(--secondary))" stroke="hsl(var(--primary))" />
                <text x="523" y="60" textAnchor="middle" fontFamily="monospace" fontSize="13" fontWeight="700" fill="hsl(var(--primary))">Escrow.tip(handle)</text>
                <text x="523" y="78" textAnchor="middle" fontFamily="monospace" fontSize="11" fill="hsl(var(--muted-foreground))">wallet-signed</text>

                <line x1="628" y1="50" x2="664" y2="34" stroke="hsl(var(--primary))" strokeWidth="1.5" markerEnd="url(#lp-ar)" />
                <line x1="628" y1="74" x2="664" y2="90" stroke="hsl(var(--primary))" strokeWidth="1.5" markerEnd="url(#lp-ar)" />

                <rect x="668" y="8" width="304" height="44" fill="hsl(var(--card))" stroke="hsl(var(--border))" />
                <text x="820" y="27" textAnchor="middle" fontFamily="monospace" fontSize="12" fill="hsl(var(--foreground))">registered →</text>
                <text x="820" y="43" textAnchor="middle" fontFamily="monospace" fontSize="12" fontWeight="700" fill="hsl(var(--primary))">direct transfer, &lt; 1s</text>

                <rect x="668" y="72" width="304" height="44" fill="hsl(var(--card))" stroke="hsl(var(--border))" />
                <text x="820" y="91" textAnchor="middle" fontFamily="monospace" fontSize="12" fill="hsl(var(--foreground))">unregistered →</text>
                <text x="820" y="107" textAnchor="middle" fontFamily="monospace" fontSize="12" fontWeight="700" fill="hsl(var(--primary))">held in escrow</text>

                {/* divider */}
                <line x1="8" y1="160" x2="972" y2="160" stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="3 4" />

                {/* Row 2 — Claim */}
                <text x="8" y="190" fontFamily="monospace" fontSize="12" fill="hsl(var(--muted-foreground))">{"// claim — when the recipient wasn't on Xenia yet"}</text>

                <rect x="8" y="204" width="210" height="56" fill="hsl(var(--card))" stroke="hsl(var(--border))" />
                <text x="113" y="236" textAnchor="middle" fontFamily="monospace" fontSize="13" fill="hsl(var(--foreground))">Recipient signs up</text>

                <line x1="220" y1="232" x2="254" y2="232" stroke="hsl(var(--primary))" strokeWidth="1.5" markerEnd="url(#lp-ar)" />

                <rect x="258" y="204" width="330" height="56" fill="hsl(var(--secondary))" stroke="hsl(var(--primary))" />
                <text x="423" y="230" textAnchor="middle" fontFamily="monospace" fontSize="13" fontWeight="700" fill="hsl(var(--primary))">registerWallet(handle, wallet)</text>
                <text x="423" y="248" textAnchor="middle" fontFamily="monospace" fontSize="11" fill="hsl(var(--muted-foreground))">immutable, on-chain</text>

                <line x1="590" y1="232" x2="624" y2="232" stroke="hsl(var(--primary))" strokeWidth="1.5" markerEnd="url(#lp-ar)" />

                <rect x="628" y="204" width="344" height="56" fill="hsl(var(--card))" stroke="hsl(var(--border))" />
                <text x="800" y="236" textAnchor="middle" fontFamily="monospace" fontSize="13" fill="hsl(var(--foreground))">claim(handle) → funds in wallet</text>
              </svg>
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
