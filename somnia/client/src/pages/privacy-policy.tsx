import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicy() {
  return (
    <div className="max-w-2xl mx-auto py-8 sm:py-12 px-4 sm:px-6 space-y-8">
      <Link href="/">
        <a className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </a>
      </Link>

      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Privacy Policy</h1>
        <p className="text-muted-foreground mt-2">Last updated: {new Date().toLocaleDateString()}</p>
      </div>

      <div className="prose prose-sm dark:prose-invert space-y-6">
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">1. Information We Collect</h2>
          <p className="text-muted-foreground">
            Xenia collects your Twitter/X profile information (username, display name, profile picture)
            when you log in via Privy. We also store your Somnia wallet addresses and transaction records
            associated with tipping activity on the platform.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">2. How We Use Your Information</h2>
          <p className="text-muted-foreground">
            Your information is used to operate the tipping service, notify you of pending tips,
            and display your transaction history. We do not sell your data to third parties.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">3. Blockchain Data</h2>
          <p className="text-muted-foreground">
            Transactions on Somnia Network are public and immutable. Wallet addresses and tip
            amounts are visible on-chain. Xenia cannot delete or modify on-chain data.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">4. Cookies & Sessions</h2>
          <p className="text-muted-foreground">
            We use session cookies to keep you logged in. No cross-site tracking cookies are used.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">5. Contact</h2>
          <p className="text-muted-foreground">
            For privacy-related questions, contact us via the Xenia Twitter account.
          </p>
        </section>
      </div>
    </div>
  );
}
