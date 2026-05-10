import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function TermsConditions() {
  return (
    <div className="max-w-2xl mx-auto py-12 px-6 space-y-8">
      <Link href="/">
        <a className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </a>
      </Link>

      <div>
        <h1 className="text-3xl font-bold">Terms & Conditions</h1>
        <p className="text-muted-foreground mt-2">Last updated: {new Date().toLocaleDateString()}</p>
      </div>

      <div className="space-y-6">
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">1. Acceptance</h2>
          <p className="text-muted-foreground text-sm">
            By using Xenia, you agree to these terms. If you do not agree, do not use the service.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">2. Service Description</h2>
          <p className="text-muted-foreground text-sm">
            Xenia is a tipping platform that facilitates peer-to-peer cryptocurrency transfers on
            Somnia Network. We are not a financial institution and do not hold custody of your funds
            beyond the smart contract escrow mechanism.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">3. Testnet Disclaimer</h2>
          <p className="text-muted-foreground text-sm">
            Xenia currently operates on Somnia Testnet. Testnet tokens (STT) have no monetary value.
            Do not transfer real assets to testnet addresses.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">4. Wallet Responsibility</h2>
          <p className="text-muted-foreground text-sm">
            You are solely responsible for the security of your wallet private keys.
            Xenia cannot recover lost wallets or reverse on-chain transactions.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">5. Prohibited Uses</h2>
          <p className="text-muted-foreground text-sm">
            You may not use Xenia for money laundering, harassment, spam, or any illegal activity.
            Violation may result in account suspension.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">6. Limitation of Liability</h2>
          <p className="text-muted-foreground text-sm">
            Xenia is provided "as is." We are not liable for losses arising from smart contract bugs,
            network downtime, or user error.
          </p>
        </section>
      </div>
    </div>
  );
}
