"""
Xenia Twitter Bot
-----------------
Two responsibilities:
  1. Notify recipients of pending escrow tips (polling mode)
  2. Listen for mention commands like "@XeniaBot tip @someone 0.5"
     and execute tipOnBehalf() on-chain (non-custodial Mode B)

Environment variables:
  XENIA_API_BASE           Backend URL (default: https://xenia.app)
  XENIA_BOT_API_KEY        Extension API key for bot user
  TWITTER_API_KEY          X Developer App API key
  TWITTER_API_SECRET
  TWITTER_ACCESS_TOKEN     Bot account access token
  TWITTER_ACCESS_SECRET
  TWITTER_BEARER_TOKEN     For stream/search
  SOMNIA_RPC_URL           (default: https://dream-rpc.somnia.network)
  ESCROW_CONTRACT_ADDRESS
  BACKEND_WALLET_PRIVATE_KEY  Bot's on-chain wallet (executes tipOnBehalf)
  POLL_INTERVAL            Seconds between notification checks (default: 60)
"""

import os
import re
import sys
import time
import json
import logging
from decimal import Decimal

import requests
import tweepy
from web3 import Web3
from eth_account import Account
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("xenia-bot")

# ─── Config ───────────────────────────────────────────────────────────────────

XENIA_API_BASE    = os.getenv("XENIA_API_BASE", "https://xenia.app").rstrip("/")
BOT_API_KEY       = os.getenv("XENIA_BOT_API_KEY", "")
POLL_INTERVAL     = int(os.getenv("POLL_INTERVAL", "60"))
RPC_URL           = os.getenv("SOMNIA_RPC_URL", "https://dream-rpc.somnia.network")
ESCROW_ADDR       = os.getenv("ESCROW_CONTRACT_ADDRESS", "")
BOT_PRIVATE_KEY   = os.getenv("BACKEND_WALLET_PRIVATE_KEY", "")

TWITTER_API_KEY       = os.getenv("TWITTER_API_KEY", "")
TWITTER_API_SECRET    = os.getenv("TWITTER_API_SECRET", "")
TWITTER_ACCESS_TOKEN  = os.getenv("TWITTER_ACCESS_TOKEN", "")
TWITTER_ACCESS_SECRET = os.getenv("TWITTER_ACCESS_SECRET", "")
TWITTER_BEARER_TOKEN  = os.getenv("TWITTER_BEARER_TOKEN", "")

# ─── Escrow ABI (minimal) ─────────────────────────────────────────────────────

ESCROW_ABI = json.loads("""[
  {"name":"tipOnBehalf","type":"function","stateMutability":"nonpayable",
   "inputs":[
     {"name":"sender","type":"address"},
     {"name":"recipientTwitterId","type":"string"},
     {"name":"amount","type":"uint256"}
   ],"outputs":[]},
  {"name":"depositedBalance","type":"function","stateMutability":"view",
   "inputs":[{"name":"","type":"address"}],"outputs":[{"name":"","type":"uint256"}]},
  {"name":"isAuthorized","type":"function","stateMutability":"view",
   "inputs":[{"name":"user","type":"address"},{"name":"delegate","type":"address"}],
   "outputs":[{"name":"","type":"bool"}]},
  {"name":"getRegisteredWallet","type":"function","stateMutability":"view",
   "inputs":[{"name":"twitterId","type":"string"}],"outputs":[{"name":"","type":"address"}]}
]""")

# ─── Web3 Setup ───────────────────────────────────────────────────────────────

def make_web3():
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        raise RuntimeError(f"Cannot connect to Somnia RPC: {RPC_URL}")
    return w3

def make_escrow(w3):
    return w3.eth.contract(
        address=Web3.to_checksum_address(ESCROW_ADDR),
        abi=ESCROW_ABI,
    )

def make_twitter_client():
    return tweepy.Client(
        bearer_token=TWITTER_BEARER_TOKEN,
        consumer_key=TWITTER_API_KEY,
        consumer_secret=TWITTER_API_SECRET,
        access_token=TWITTER_ACCESS_TOKEN,
        access_token_secret=TWITTER_ACCESS_SECRET,
        wait_on_rate_limit=True,
    )

# ─── Backend API helpers ───────────────────────────────────────────────────────

def xenia_get(path):
    r = requests.get(
        f"{XENIA_API_BASE}{path}",
        headers={"X-Extension-Key": BOT_API_KEY},
        timeout=15,
    )
    r.raise_for_status()
    return r.json()

def xenia_post(path, data=None):
    r = requests.post(
        f"{XENIA_API_BASE}{path}",
        headers={"X-Extension-Key": BOT_API_KEY, "Content-Type": "application/json"},
        json=data or {},
        timeout=15,
    )
    r.raise_for_status()
    return r.json()

# ─── Command parser ───────────────────────────────────────────────────────────

# Matches: @XeniaBot tip @someone 0.5
# or:      @XeniaBot tip @someone 0.5 STT
TIP_PATTERN = re.compile(
    r"@\w+\s+tip\s+@(\w+)\s+([\d]+(?:\.[\d]+)?)\s*(?:STT|stt)?",
    re.IGNORECASE,
)

def parse_tip_command(text):
    """
    Returns (recipient_handle, amount_stt) or None if not a valid command.
    """
    m = TIP_PATTERN.search(text)
    if not m:
        return None
    handle = m.group(1).lstrip("@")
    try:
        amount = Decimal(m.group(2))
    except Exception:
        return None
    if amount <= 0 or amount > 1000:
        return None
    return handle, amount

# ─── On-chain execution ───────────────────────────────────────────────────────

def execute_tip_on_behalf(w3, escrow, sender_address, recipient_twitter_id, amount_stt):
    """
    Calls Escrow.tipOnBehalf() from the bot wallet.
    Returns tx_hash string or raises on failure.
    """
    bot_account = Account.from_key(BOT_PRIVATE_KEY)
    bot_address = bot_account.address

    amount_wei = w3.to_wei(amount_stt, "ether")

    # Pre-checks
    deposited = escrow.functions.depositedBalance(
        Web3.to_checksum_address(sender_address)
    ).call()
    if deposited < amount_wei:
        raise ValueError(
            f"Insufficient deposit: has {w3.from_wei(deposited, 'ether')} STT, "
            f"needs {amount_stt} STT"
        )

    is_auth = escrow.functions.isAuthorized(
        Web3.to_checksum_address(sender_address),
        bot_address,
    ).call()
    if not is_auth:
        raise PermissionError("Bot not authorized by sender. Go to xenia.app to authorize.")

    nonce = w3.eth.get_transaction_count(bot_address)
    gas_price = w3.eth.gas_price

    tx = escrow.functions.tipOnBehalf(
        Web3.to_checksum_address(sender_address),
        recipient_twitter_id,
        amount_wei,
    ).build_transaction({
        "from":     bot_address,
        "nonce":    nonce,
        "gasPrice": gas_price,
        "gas":      200_000,
        "chainId":  int(os.getenv("SOMNIA_CHAIN_ID", "50312")),
    })

    signed = w3.eth.account.sign_transaction(tx, BOT_PRIVATE_KEY)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=30)

    if receipt.status != 1:
        raise RuntimeError(f"Transaction reverted: {tx_hash.hex()}")

    return tx_hash.hex()

# ─── Mention handler ─────────────────────────────────────────────────────────

def resolve_twitter_id(client, handle):
    """Look up numeric Twitter ID from a handle."""
    resp = client.get_user(username=handle)
    if resp.data:
        return str(resp.data.id)
    return None

def handle_mention(client, w3, escrow, mention, bot_username):
    """
    Process a single mention tweet.
    Returns a reply string to send back.
    """
    text        = mention.text or ""
    author_id   = str(mention.author_id)
    tweet_id    = str(mention.id)

    log.info(f"Mention from {author_id}: {text!r}")

    parsed = parse_tip_command(text)
    if not parsed:
        return None  # Not a tip command, ignore

    recipient_handle, amount_stt = parsed
    log.info(f"Tip command: @{recipient_handle} {amount_stt} STT from {author_id}")

    # 1. Look up sender's registered wallet
    try:
        sender_data = xenia_get(f"/api/users/{author_id}")
        sender_wallet = sender_data.get("linkedWalletAddress") or sender_data.get("embeddedWalletAddress")
    except Exception as e:
        log.warning(f"Sender {author_id} not found in Xenia: {e}")
        return (
            f"@{mention.author_id} You need to connect your wallet first. "
            f"Visit xenia.app to get started! 🚀"
        )

    if not sender_wallet:
        return (
            f"No wallet found for your account. "
            f"Visit xenia.app to create one, then deposit STT and authorize the bot."
        )

    # 2. Look up recipient Twitter ID
    recipient_id = resolve_twitter_id(client, recipient_handle)
    if not recipient_id:
        return f"@{recipient_handle} not found on X."

    # 3. Execute on-chain
    try:
        tx_hash = execute_tip_on_behalf(
            w3, escrow, sender_wallet, recipient_id, amount_stt
        )
        explorer = os.getenv("SOMNIA_EXPLORER_URL", "https://shannon-explorer.somnia.network")
        return (
            f"✅ {amount_stt} STT sent to @{recipient_handle} on Somnia!\n"
            f"Tx: {explorer}/tx/{tx_hash}"
        )
    except ValueError as e:
        return f"❌ {e}\nDeposit more STT at xenia.app/deposit"
    except PermissionError as e:
        return f"❌ {e}"
    except Exception as e:
        log.error(f"tipOnBehalf failed: {e}")
        return "❌ Transaction failed. Please try again or visit xenia.app."

# ─── Mention polling ─────────────────────────────────────────────────────────

class MentionPoller:
    """Polls the bot's mentions every POLL_INTERVAL seconds and processes tip commands."""

    def __init__(self, client, w3, escrow, bot_user_id, bot_username):
        self.client       = client
        self.w3           = w3
        self.escrow       = escrow
        self.bot_user_id  = bot_user_id
        self.bot_username = bot_username
        self.since_id     = None

    def poll(self):
        kwargs = {
            "id":            self.bot_user_id,
            "tweet_fields":  ["author_id", "text"],
            "max_results":   10,
            "expansions":    ["author_id"],
        }
        if self.since_id:
            kwargs["since_id"] = self.since_id

        try:
            resp = self.client.get_users_mentions(**kwargs)
        except tweepy.TweepyException as e:
            log.error(f"Mention poll error: {e}")
            return

        if not resp.data:
            return

        # Process oldest first
        for mention in reversed(resp.data):
            self.since_id = max(self.since_id or 0, int(mention.id))
            reply = handle_mention(
                self.client, self.w3, self.escrow, mention, self.bot_username
            )
            if reply:
                try:
                    self.client.create_tweet(
                        text=f"@{mention.author_id} {reply}"[:280],
                        in_reply_to_tweet_id=mention.id,
                    )
                    log.info(f"Replied to mention {mention.id}")
                except tweepy.TweepyException as e:
                    log.error(f"Reply failed: {e}")
                time.sleep(1)  # rate limit buffer

# ─── Notification loop (Mode 1) ───────────────────────────────────────────────

def process_pending_notifications(client):
    try:
        claims = xenia_get("/api/bot/pending-notifications")
    except Exception as e:
        log.error(f"Fetch notifications failed: {e}")
        return 0

    if not claims:
        return 0

    notified = 0
    for claim in claims:
        claim_id     = claim.get("id")
        recipient_id = claim.get("recipientTwitterId")
        amount_fmt   = claim.get("amountFormatted", "?")

        if not claim_id or not recipient_id:
            continue

        try:
            user = xenia_get(f"/api/users/{recipient_id}")
            handle = user.get("twitterHandle", recipient_id)
        except Exception:
            handle = recipient_id

        try:
            client.create_tweet(
                text=(
                    f"@{handle} 👋 Someone sent you {amount_fmt} STT via Xenia! "
                    f"Visit xenia.app to claim it. #Somnia #Xenia"
                )[:280]
            )
            xenia_post(f"/api/bot/claims/{claim_id}/notified")
            notified += 1
            log.info(f"Notified @{handle} (claim {claim_id})")
        except Exception as e:
            log.error(f"Notify failed for claim {claim_id}: {e}")

        time.sleep(2)

    return notified

# ─── Healthcheck ──────────────────────────────────────────────────────────────

def healthcheck(client, w3):
    ok = True

    try:
        data = xenia_get("/api/somnia/network")
        log.info(f"Backend OK — chain {data.get('chainId')}")
    except Exception as e:
        log.error(f"Backend check failed: {e}")
        ok = False

    if not w3.is_connected():
        log.error("Somnia RPC not reachable")
        ok = False
    else:
        block = w3.eth.block_number
        log.info(f"Somnia RPC OK — block #{block}")

    try:
        me = client.get_me()
        log.info(f"Twitter OK — @{me.data.username} (id {me.data.id})")
        return ok, str(me.data.id), me.data.username
    except Exception as e:
        log.error(f"Twitter auth failed: {e}")
        return False, None, None

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    log.info("═══════════════════════════════════════════")
    log.info("  Xenia Bot Starting")
    log.info(f"  API:  {XENIA_API_BASE}")
    log.info(f"  RPC:  {RPC_URL}")
    log.info(f"  Poll: {POLL_INTERVAL}s")
    log.info("═══════════════════════════════════════════")

    if not BOT_API_KEY:
        log.error("XENIA_BOT_API_KEY not set"); sys.exit(1)
    if not ESCROW_ADDR:
        log.error("ESCROW_CONTRACT_ADDRESS not set"); sys.exit(1)
    if not BOT_PRIVATE_KEY:
        log.error("BACKEND_WALLET_PRIVATE_KEY not set"); sys.exit(1)

    client = make_twitter_client()
    w3     = make_web3()
    escrow = make_escrow(w3)

    ok, bot_user_id, bot_username = healthcheck(client, w3)
    if not ok:
        log.error("Healthcheck failed. Fix errors above and restart.")
        sys.exit(1)

    log.info(f"Bot wallet: {Account.from_key(BOT_PRIVATE_KEY).address}")
    log.info("Bot is running. Ctrl+C to stop.")

    poller = MentionPoller(client, w3, escrow, bot_user_id, bot_username)

    tick = 0
    while True:
        try:
            # Check mentions every poll cycle
            poller.poll()

            # Check pending notifications every 5 cycles
            if tick % 5 == 0:
                count = process_pending_notifications(client)
                if count:
                    log.info(f"Sent {count} claim notification(s)")

            tick += 1
        except KeyboardInterrupt:
            log.info("Shutting down.")
            break
        except Exception as e:
            log.error(f"Main loop error: {e}")

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
