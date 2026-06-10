import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";
import { ThemeToggle } from "@/components/theme-toggle";

const ESCROW_ADDRESS = "0xEf0ca54F3C195737880127df62069C5B5A17B458";
const REGISTRY_ADDRESS = "0x9C3c6b9cc4ECdA73e65A240DD0cD075ce202AfE3";

interface Section {
  id: string;
  label: string;
}

const sections: Section[] = [
  { id: "overview", label: "Overview" },
  { id: "architecture", label: "Architecture" },
  { id: "mode-a", label: "Mode A — Direct tip" },
  { id: "mode-b", label: "Mode B — Twitter command" },
  { id: "claim", label: "Claim flow" },
  { id: "network", label: "Network & contracts" },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-background font-mono text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="shrink-0">
            <span className="font-ruthie text-4xl leading-none text-primary">
              Xenia
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to home
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-10 px-6 py-12 lg:flex-row flex-col">
        {/* Section index */}
        <nav
          aria-label="Documentation sections"
          className="lg:sticky lg:top-24 lg:h-fit lg:w-56 shrink-0"
        >
          <p className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">
            {"// CONTENTS"}
          </p>
          <ul className="flex flex-col gap-1">
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="block border-l-2 border-transparent py-1 pl-3 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1 space-y-16">
          <Overview />
          <Architecture />
          <ModeA />
          <ModeB />
          <ClaimFlow />
          <NetworkContracts />
        </main>
      </div>

      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 text-sm text-muted-foreground">
          <span>Powered by Somnia Network</span>
          <Link href="/" className="hover:text-foreground">
            Home
          </Link>
        </div>
      </footer>
    </div>
  );
}

// ─── Section primitives ───────────────────────────────────────────────────────

interface DocSectionProps {
  id: string;
  kicker: string;
  title: string;
  children: ReactNode;
}

function DocSection({ id, kicker, title, children }: DocSectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-24">
      <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
        {`// ${kicker}`}
      </p>
      <h2 id={`${id}-heading`} className="mb-5 text-2xl font-bold text-primary">
        {title}
      </h2>
      <div className="space-y-4 text-sm leading-relaxed text-foreground">
        {children}
      </div>
    </section>
  );
}

function DiagramFrame({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <figure className="mt-6 border border-border bg-card p-4">
      <figcaption className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">
        {title}
      </figcaption>
      <div className="w-full overflow-x-auto">{children}</div>
    </figure>
  );
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function Overview() {
  return (
    <DocSection id="overview" kicker="OVERVIEW" title="What is Xenia?">
      <p>
        Xenia turns <span className="text-primary">every post on X</span> into
        something tippable. Tip any creator by their Twitter handle — they don't
        need a wallet, an account, or even to know Xenia exists yet. Funds settle
        on <span className="text-primary">Somnia Network</span> with sub-second
        finality and near-zero fees.
      </p>
      <p>
        If the recipient is already registered, the tip lands directly in their
        wallet. If not, it waits safely in an on-chain{" "}
        <span className="text-primary">escrow</span>, keyed to their handle,
        until they sign up and claim it. A bot nudges them on X so onboarding
        becomes virality.
      </p>
      <p className="text-muted-foreground">
        Two ways to tip: <span className="text-foreground">Mode A</span> — a
        direct on-chain tip from the web app or browser extension.{" "}
        <span className="text-foreground">Mode B</span> — reply to any tweet
        with a tip command and let the Gemini bot execute it on your behalf.
      </p>
    </DocSection>
  );
}

function Architecture() {
  return (
    <DocSection
      id="architecture"
      kicker="ARCHITECTURE"
      title="How the pieces fit"
    >
      <p>
        Three layers. On-chain contracts hold value and identity. A backend
        indexes, authenticates, and runs the bot. The web app and browser
        extension are the surfaces users touch.
      </p>
      <DiagramFrame title="System overview">
        <ArchitectureSvg />
      </DiagramFrame>
      <ul className="ml-4 list-disc space-y-1.5 text-muted-foreground marker:text-primary">
        <li>
          <span className="text-foreground">Escrow</span> — holds tips by handle
          and releases on registration.
        </li>
        <li>
          <span className="text-foreground">ScreenshotRegistry</span> — anchors
          proof-of-post screenshots on-chain.
        </li>
        <li>
          <span className="text-foreground">Backend</span> — Express + Drizzle
          over Neon Postgres, plus the Gemini tipping bot.
        </li>
        <li>
          <span className="text-foreground">Web + Extension</span> — the React
          app and the in-feed tip button on X.
        </li>
      </ul>
    </DocSection>
  );
}

function ModeA() {
  return (
    <DocSection id="mode-a" kicker="MODE A" title="Direct tip">
      <p>
        The simplest path. You click <span className="text-primary">Tip</span>,
        sign one transaction, and the Escrow contract decides where the money
        goes based on whether the recipient handle is registered.
      </p>
      <DiagramFrame title="Mode A — direct tip flow">
        <ModeASvg />
      </DiagramFrame>
      <p className="text-muted-foreground">
        Registered recipients get an instant direct transfer. Everyone else has
        their tip parked in escrow under their lowercase handle — claimable the
        moment they sign up.
      </p>
    </DocSection>
  );
}

function ModeB() {
  return (
    <DocSection id="mode-b" kicker="MODE B" title="Twitter command">
      <p>
        Tip without leaving X. Deposit funds and authorize the bot once, then
        reply to any tweet with a tip command. The{" "}
        <span className="text-primary">Gemini bot</span> reads the intent and
        calls the Escrow on your behalf.
      </p>
      <DiagramFrame title="Mode B — tweet command flow">
        <ModeBSvg />
      </DiagramFrame>
      <p className="text-muted-foreground">
        Your authorization is scoped and revocable. The bot can only move funds
        you've explicitly deposited and authorized for tipping.
      </p>
    </DocSection>
  );
}

function ClaimFlow() {
  return (
    <DocSection id="claim" kicker="CLAIM" title="Claiming an escrowed tip">
      <p>
        A tip waiting in escrow is yours the moment you prove the handle is
        yours. Sign up with X, register your wallet, and claim.
      </p>
      <DiagramFrame title="Claim flow">
        <ClaimSvg />
      </DiagramFrame>
      <p className="text-muted-foreground">
        Registration maps your verified handle to your wallet in the
        ScreenshotRegistry-backed records, so the Escrow knows exactly which
        balance to release.
      </p>
    </DocSection>
  );
}

function NetworkContracts() {
  return (
    <DocSection
      id="network"
      kicker="NETWORK"
      title="Network & contracts"
    >
      <p>
        Xenia is live on the Somnia Shannon Testnet. The deployed contract
        addresses:
      </p>
      <div className="mt-4 overflow-x-auto border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium">Value</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr className="border-b border-border">
              <td className="px-4 py-3 text-foreground">Network</td>
              <td className="px-4 py-3">Somnia Shannon Testnet</td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-4 py-3 text-foreground">Chain ID</td>
              <td className="px-4 py-3 font-mono text-primary">50312</td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-4 py-3 text-foreground">Escrow</td>
              <td className="px-4 py-3 break-all font-mono text-xs">
                {ESCROW_ADDRESS}
              </td>
            </tr>
            <tr>
              <td className="px-4 py-3 text-foreground">
                ScreenshotRegistry
              </td>
              <td className="px-4 py-3 break-all font-mono text-xs">
                {REGISTRY_ADDRESS}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </DocSection>
  );
}

// ─── Hand-authored SVG diagrams ───────────────────────────────────────────────
//
// Palette mapping (theme-agnostic via currentColor + tokens):
//   stroke / borders  → hsl(var(--border))  (#2A2222 dark / #F9DFDF light)
//   accent / arrows   → hsl(var(--primary)) (#F5AFAF)
//   primary text      → hsl(var(--foreground))
//   muted text        → hsl(var(--muted-foreground)) (#8E8383)
//   box fill          → hsl(var(--card))
// All SVGs are responsive: width 100%, fixed viewBox, height auto.

const SVG_TEXT = "hsl(var(--foreground))";
const SVG_MUTED = "hsl(var(--muted-foreground))";
const SVG_BORDER = "hsl(var(--border))";
const SVG_ACCENT = "hsl(var(--primary))";
const SVG_FILL = "hsl(var(--card))";

function ArrowDefs({ id }: { id: string }) {
  return (
    <defs>
      <marker
        id={id}
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M0,0 L10,5 L0,10 z" fill={SVG_ACCENT} />
      </marker>
    </defs>
  );
}

interface BoxProps {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub?: string;
  accent?: boolean;
}

function Box({ x, y, w, h, title, sub, accent }: BoxProps) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={SVG_FILL}
        stroke={accent ? SVG_ACCENT : SVG_BORDER}
        strokeWidth={accent ? 1.5 : 1}
      />
      <text
        x={x + w / 2}
        y={sub ? y + h / 2 - 4 : y + h / 2 + 4}
        textAnchor="middle"
        fontSize="12"
        fontFamily="monospace"
        fontWeight="bold"
        fill={SVG_TEXT}
      >
        {title}
      </text>
      {sub ? (
        <text
          x={x + w / 2}
          y={y + h / 2 + 12}
          textAnchor="middle"
          fontSize="9"
          fontFamily="monospace"
          fill={SVG_MUTED}
        >
          {sub}
        </text>
      ) : null}
    </g>
  );
}

function EdgeLabel({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fontSize="9"
      fontFamily="monospace"
      fill={SVG_MUTED}
    >
      {text}
    </text>
  );
}

function ArchitectureSvg() {
  const m = "arch-arrow";
  return (
    <svg
      viewBox="0 0 720 300"
      className="h-auto w-full"
      role="img"
      aria-label="Architecture: contracts connect to backend, which connects to web and extension."
    >
      <ArrowDefs id={m} />

      {/* Contracts column */}
      <text x="110" y="24" textAnchor="middle" fontSize="10" fontFamily="monospace" fill={SVG_MUTED}>
        ON-CHAIN
      </text>
      <Box x={20} y={40} w={180} h={50} title="Escrow" sub="tips by handle" accent />
      <Box x={20} y={110} w={180} h={50} title="ScreenshotRegistry" sub="proof-of-post" />

      {/* Backend column */}
      <text x="360" y="24" textAnchor="middle" fontSize="10" fontFamily="monospace" fill={SVG_MUTED}>
        BACKEND
      </text>
      <Box x={280} y={55} w={160} h={50} title="Express + Drizzle" sub="Neon Postgres" accent />
      <Box x={280} y={130} w={160} h={50} title="Gemini bot" sub="tip executor" />

      {/* Clients column */}
      <text x="620" y="24" textAnchor="middle" fontSize="10" fontFamily="monospace" fill={SVG_MUTED}>
        SURFACES
      </text>
      <Box x={520} y={55} w={180} h={50} title="Web app" sub="React + Vite" accent />
      <Box x={520} y={130} w={180} h={50} title="Extension" sub="in-feed tip button" />

      {/* contracts <-> backend */}
      <line x1={200} y1={80} x2={280} y2={80} stroke={SVG_ACCENT} strokeWidth="1.5" markerEnd={`url(#${m})`} markerStart={`url(#${m})`} />
      <line x1={200} y1={135} x2={280} y2={150} stroke={SVG_ACCENT} strokeWidth="1.5" markerEnd={`url(#${m})`} markerStart={`url(#${m})`} />
      <EdgeLabel x={240} y={72} text="read / write" />

      {/* backend <-> clients */}
      <line x1={440} y1={80} x2={520} y2={80} stroke={SVG_ACCENT} strokeWidth="1.5" markerEnd={`url(#${m})`} markerStart={`url(#${m})`} />
      <line x1={440} y1={155} x2={520} y2={155} stroke={SVG_ACCENT} strokeWidth="1.5" markerEnd={`url(#${m})`} markerStart={`url(#${m})`} />
      <EdgeLabel x={480} y={72} text="REST / auth" />

      {/* bot writes to escrow (curved back) */}
      <path
        d="M280,165 C150,230 110,210 110,165"
        fill="none"
        stroke={SVG_BORDER}
        strokeWidth="1"
        strokeDasharray="4 3"
        markerEnd={`url(#${m})`}
      />
      <EdgeLabel x={170} y={222} text="tipOnBehalf →" />
    </svg>
  );
}

function ModeASvg() {
  const m = "modea-arrow";
  return (
    <svg
      viewBox="0 0 720 200"
      className="h-auto w-full"
      role="img"
      aria-label="Mode A: click tip, call Escrow.tip(handle); if registered it is a direct transfer, otherwise escrow."
    >
      <ArrowDefs id={m} />

      <Box x={10} y={75} w={120} h={50} title="Click Tip" sub="web / extension" accent />
      <Box x={200} y={75} w={150} h={50} title="Escrow.tip" sub="(handle)" accent />

      {/* decision diamond */}
      <polygon
        points="445,100 490,70 535,100 490,130"
        fill={SVG_FILL}
        stroke={SVG_ACCENT}
        strokeWidth="1.5"
      />
      <text x="490" y="103" textAnchor="middle" fontSize="10" fontFamily="monospace" fontWeight="bold" fill={SVG_TEXT}>
        registered?
      </text>

      <Box x={600} y={30} w={110} h={44} title="Direct" sub="instant transfer" />
      <Box x={600} y={120} w={110} h={44} title="Escrow" sub="held by handle" />

      <line x1={130} y1={100} x2={200} y2={100} stroke={SVG_ACCENT} strokeWidth="1.5" markerEnd={`url(#${m})`} />
      <line x1={350} y1={100} x2={445} y2={100} stroke={SVG_ACCENT} strokeWidth="1.5" markerEnd={`url(#${m})`} />

      <line x1={510} y1={82} x2={600} y2={55} stroke={SVG_ACCENT} strokeWidth="1.5" markerEnd={`url(#${m})`} />
      <EdgeLabel x={560} y={58} text="yes" />
      <line x1={510} y1={118} x2={600} y2={140} stroke={SVG_ACCENT} strokeWidth="1.5" markerEnd={`url(#${m})`} />
      <EdgeLabel x={560} y={145} text="no" />
    </svg>
  );
}

function ModeBSvg() {
  const m = "modeb-arrow";
  return (
    <svg
      viewBox="0 0 720 180"
      className="h-auto w-full"
      role="img"
      aria-label="Mode B: deposit and authorize, tweet a tip command, the Gemini bot reads it and calls tipOnBehalf."
    >
      <ArrowDefs id={m} />

      <Box x={10} y={60} w={140} h={56} title="Deposit +" sub="authorize bot" accent />
      <Box x={195} y={60} w={130} h={56} title="Tweet" sub="@tip command" />
      <Box x={370} y={60} w={130} h={56} title="Gemini bot" sub="parse intent" accent />
      <Box x={545} y={60} w={160} h={56} title="tipOnBehalf" sub="Escrow call" accent />

      <line x1={150} y1={88} x2={195} y2={88} stroke={SVG_ACCENT} strokeWidth="1.5" markerEnd={`url(#${m})`} />
      <line x1={325} y1={88} x2={370} y2={88} stroke={SVG_ACCENT} strokeWidth="1.5" markerEnd={`url(#${m})`} />
      <line x1={500} y1={88} x2={545} y2={88} stroke={SVG_ACCENT} strokeWidth="1.5" markerEnd={`url(#${m})`} />

      <EdgeLabel x={258} y={50} text="on X" />
      <EdgeLabel x={624} y={50} text="on-chain" />
    </svg>
  );
}

function ClaimSvg() {
  const m = "claim-arrow";
  return (
    <svg
      viewBox="0 0 720 160"
      className="h-auto w-full"
      role="img"
      aria-label="Claim flow: sign up, register wallet, then claim the escrowed tip."
    >
      <ArrowDefs id={m} />

      <Box x={20} y={55} w={150} h={56} title="Sign up" sub="verify X handle" accent />
      <Box x={250} y={55} w={170} h={56} title="registerWallet" sub="map handle → wallet" accent />
      <Box x={500} y={55} w={150} h={56} title="Claim" sub="escrow released" accent />

      <line x1={170} y1={83} x2={250} y2={83} stroke={SVG_ACCENT} strokeWidth="1.5" markerEnd={`url(#${m})`} />
      <line x1={420} y1={83} x2={500} y2={83} stroke={SVG_ACCENT} strokeWidth="1.5" markerEnd={`url(#${m})`} />
    </svg>
  );
}
