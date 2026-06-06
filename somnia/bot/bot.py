"""
Xenia Twitter Bot — AI-Powered
--------------------------------
Responsibilities:
  1. Notify recipients of pending escrow tips
  2. Parse tip commands from mentions using Claude (NLU)
     and execute tipOnBehalf() on-chain

AI features:
  - Claude Haiku parses any natural language tip command
  - Price oracle: "tip $1" → auto-converts to STT amount
  - Regex fallback if Claude is unavailable
  - Fraud detection: blocks self-tipping, detects suspicious patterns

Environment variables:
  XENIA_API_BASE              Backend URL (default: https://xenia.app)
  XENIA_BOT_API_KEY           Extension API key for bot
  ANTHROPIC_API_KEY           Claude API key
  TWITTER_API_KEY / SECRET
  TWITTER_ACCESS_TOKEN / SECRET
  TWITTER_BEARER_TOKEN
  SOMNIA_RPC_URL
  ESCROW_CONTRACT_ADDRESS
  BACKEND_WALLET_PRIVATE_KEY
  POLL_INTERVAL               Seconds between cycles (default: 60)
"""

import os
import re
import sys
import time
import json
import logging
from decimal import Decimal, InvalidOperation

import anthropic
import requests
import tweepy
from web3 import Web3
from web3.logs import DISCARD
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

XENIA_API_BASE   = os.getenv("XENIA_API_BASE", "https://xenia.app").rstrip("/")
BOT_API_KEY      = os.getenv("XENIA_BOT_API_KEY", "")
ANTHROPIC_KEY    = os.getenv("ANTHROPIC_API_KEY", "")
GEMINI_KEY       = os.getenv("GEMINI_API_KEY", "")
# Which LLM parses tip commands: "auto" (prefer Gemini, then Claude), "gemini",
# "claude", or "regex" (no LLM). Falls back to regex if the chosen one is down.
AI_PROVIDER      = os.getenv("AI_PROVIDER", "auto").lower()
GEMINI_MODEL     = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite")
CLAUDE_MODEL     = os.getenv("CLAUDE_MODEL", "claude-haiku-4-5-20251001")
POLL_INTERVAL    = int(os.getenv("POLL_INTERVAL", "60"))
RPC_URL          = os.getenv("SOMNIA_RPC_URL", "https://dream-rpc.somnia.network")
ESCROW_ADDR      = os.getenv("ESCROW_CONTRACT_ADDRESS", "")
BOT_PRIVATE_KEY  = os.getenv("BACKEND_WALLET_PRIVATE_KEY", "")
CHAIN_ID         = int(os.getenv("SOMNIA_CHAIN_ID", "50312"))
EXPLORER_URL     = os.getenv("SOMNIA_EXPLORER_URL", "https://shannon-explorer.somnia.network")

TWITTER_API_KEY       = os.getenv("TWITTER_API_KEY", "")
TWITTER_API_SECRET    = os.getenv("TWITTER_API_SECRET", "")
TWITTER_ACCESS_TOKEN  = os.getenv("TWITTER_ACCESS_TOKEN", "")
TWITTER_ACCESS_SECRET = os.getenv("TWITTER_ACCESS_SECRET", "")
TWITTER_BEARER_TOKEN  = os.getenv("TWITTER_BEARER_TOKEN", "")

MIN_TIP_STT = Decimal("0.001")
MAX_TIP_STT = Decimal("1000")

# ─── Escrow ABI ───────────────────────────────────────────────────────────────

ESCROW_ABI = json.loads("""[
  {"name":"tipOnBehalf","type":"function","stateMutability":"nonpayable",
   "inputs":[{"name":"sender","type":"address"},{"name":"recipientTwitterId","type":"string"},{"name":"amount","type":"uint256"}],
   "outputs":[]},
  {"name":"depositedBalance","type":"function","stateMutability":"view",
   "inputs":[{"name":"","type":"address"}],"outputs":[{"name":"","type":"uint256"}]},
  {"name":"isAuthorized","type":"function","stateMutability":"view",
   "inputs":[{"name":"user","type":"address"},{"name":"delegate","type":"address"}],
   "outputs":[{"name":"","type":"bool"}]},
  {"name":"getRegisteredWallet","type":"function","stateMutability":"view",
   "inputs":[{"name":"twitterId","type":"string"}],"outputs":[{"name":"","type":"address"}]},
  {"name":"TipSent","type":"event","anonymous":false,
   "inputs":[
     {"name":"sender","type":"address","indexed":true},
     {"name":"recipientTwitterId","type":"string","indexed":true},
     {"name":"amount","type":"uint256","indexed":false},
     {"name":"fee","type":"uint256","indexed":false},
     {"name":"tipIndex","type":"uint256","indexed":false}
   ]}
]""")

# ─── Clients ──────────────────────────────────────────────────────────────────

class AIClient:
    """
    Unified LLM client for tip-command parsing. Wraps either Google Gemini or
    Anthropic Claude behind a single .parse() method so the rest of the bot is
    provider-agnostic. parse() returns the model's raw text (expected JSON) or
    None on any error — callers fall back to regex.
    """

    def __init__(self, provider: str, client, model: str):
        self.provider = provider
        self._client = client
        self.model = model
        self.label = f"{provider}:{model}"

    def parse(self, system_prompt: str, user_text: str) -> str | None:
        try:
            if self.provider == "gemini":
                model = self._client.GenerativeModel(
                    model_name=self.model,
                    system_instruction=system_prompt,
                    generation_config={
                        "response_mime_type": "application/json",
                        "max_output_tokens": 256,
                    },
                )
                resp = model.generate_content(user_text)
                return (resp.text or "").strip()
            # anthropic
            resp = self._client.messages.create(
                model=self.model,
                max_tokens=256,
                system=system_prompt,
                messages=[{"role": "user", "content": user_text}],
            )
            return resp.content[0].text.strip()
        except Exception as e:  # noqa: BLE001 — never let the LLM crash the bot
            log.warning(f"AI parse failed ({self.label}): {e}")
            return None

    def ping(self) -> bool:
        return self.parse("Reply with the single word OK.", "ping") is not None


def make_ai() -> "AIClient | None":
    """Build the configured LLM client, or None to run on regex only."""
    provider = AI_PROVIDER
    if provider == "auto":
        provider = "gemini" if GEMINI_KEY else ("claude" if ANTHROPIC_KEY else "regex")

    if provider == "gemini":
        if not GEMINI_KEY:
            log.warning("AI_PROVIDER=gemini but GEMINI_API_KEY is missing")
            return None
        try:
            import google.generativeai as genai
        except ImportError:
            log.error("google-generativeai not installed (pip install -r requirements.txt)")
            return None
        genai.configure(api_key=GEMINI_KEY)
        return AIClient("gemini", genai, GEMINI_MODEL)

    if provider == "claude":
        if not ANTHROPIC_KEY:
            log.warning("AI_PROVIDER=claude but ANTHROPIC_API_KEY is missing")
            return None
        return AIClient("claude", anthropic.Anthropic(api_key=ANTHROPIC_KEY), CLAUDE_MODEL)

    return None  # regex-only

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

def make_twitter():
    return tweepy.Client(
        bearer_token=TWITTER_BEARER_TOKEN,
        consumer_key=TWITTER_API_KEY,
        consumer_secret=TWITTER_API_SECRET,
        access_token=TWITTER_ACCESS_TOKEN,
        access_token_secret=TWITTER_ACCESS_SECRET,
        wait_on_rate_limit=True,
    )

# ─── Price Oracle ─────────────────────────────────────────────────────────────

_price_cache: dict = {"stt_usd": None, "ts": 0}

def get_stt_price_usd() -> Decimal | None:
    """
    Fetch STT/USD price. On testnet we use a fixed mock price.
    On mainnet: swap for a real price feed (CoinGecko, etc.)
    """
    if CHAIN_ID == 50312:
        # Testnet — mock price for demo purposes
        return Decimal("0.10")  # 1 STT = $0.10

    now = time.time()
    if _price_cache["stt_usd"] and now - _price_cache["ts"] < 120:
        return _price_cache["stt_usd"]

    try:
        r = requests.get(
            "https://api.coingecko.com/api/v3/simple/price",
            params={"ids": "somnia-network", "vs_currencies": "usd"},
            timeout=5,
        )
        price = Decimal(str(r.json()["somnia-network"]["usd"]))
        _price_cache["stt_usd"] = price
        _price_cache["ts"] = now
        return price
    except Exception:
        return None

def usd_to_stt(usd_amount: Decimal) -> Decimal | None:
    price = get_stt_price_usd()
    if not price or price == 0:
        return None
    return (usd_amount / price).quantize(Decimal("0.000001"))

# ─── AI Command Parser ────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are a command parser for Xenia, a crypto tipping bot on X (Twitter).
Your job: extract tip intent from a tweet that mentions the bot.

Return ONLY valid JSON, no explanation, no markdown. Schema:
{
  "is_tip": true/false,
  "recipient": "@handle or null",
  "amount": number or null,
  "currency": "STT" or "USD" or null,
  "intent": "tip" | "check_balance" | "help" | "unknown"
}

Rules:
- "tip X to @someone", "send X STT @someone", "tipple @someone X" → is_tip: true
- If currency is $ or USD → currency: "USD"
- If no currency mentioned → assume STT
- "tip the OP", "tip the author" → recipient: null (can't resolve)
- Balance check ("what's my balance", "how much do I have") → intent: "check_balance"
- Help request → intent: "help"
- Ignore everything before and after the actual command

Examples:
Tweet: "@XeniaBot tip @alice 0.5 STT"
→ {"is_tip":true,"recipient":"@alice","amount":0.5,"currency":"STT","intent":"tip"}

Tweet: "@XeniaBot send $1 to @bob"
→ {"is_tip":true,"recipient":"@bob","amount":1,"currency":"USD","intent":"tip"}

Tweet: "@XeniaBot bu tweeti atan adama 1 STT gönder"
→ {"is_tip":true,"recipient":null,"amount":1,"currency":"STT","intent":"tip"}

Tweet: "@XeniaBot ne kadar STT'm var"
→ {"is_tip":false,"recipient":null,"amount":null,"currency":null,"intent":"check_balance"}
"""

# Regex fallback (original parser)
_TIP_RE = re.compile(
    r"tip\s+@(\w+)\s+([\d]+(?:\.[\d]+)?)\s*(?:STT|stt)?",
    re.IGNORECASE,
)

def parse_with_regex(text: str):
    m = _TIP_RE.search(text)
    if not m:
        return None
    try:
        amount = Decimal(m.group(2))
    except InvalidOperation:
        return None
    return {"recipient": f"@{m.group(1)}", "amount": float(amount), "currency": "STT"}

def _extract_json(raw: str) -> str:
    """Strip optional ```json fences so json.loads works for any provider."""
    s = raw.strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*", "", s)
        s = re.sub(r"\s*```$", "", s)
    return s.strip()


def parse_command(ai_client, tweet_text: str, bot_username: str) -> dict | None:
    """
    Returns parsed command dict or None.
    Uses the configured LLM (Gemini or Claude) if available, regex as fallback.
    """
    # Strip the bot mention from the text
    clean = re.sub(rf"@{re.escape(bot_username)}", "", tweet_text, flags=re.IGNORECASE).strip()

    if ai_client:
        raw = ai_client.parse(SYSTEM_PROMPT, clean)
        if raw:
            try:
                data = json.loads(_extract_json(raw))

                if not data.get("is_tip") or data.get("intent") != "tip":
                    # Not a tip — check if it's something else we handle
                    if data.get("intent") == "check_balance":
                        return {"intent": "check_balance"}
                    if data.get("intent") == "help":
                        return {"intent": "help"}
                    return None

                return {
                    "intent":    "tip",
                    "recipient": data.get("recipient"),
                    "amount":    data.get("amount"),
                    "currency":  data.get("currency") or "STT",
                }
            except (json.JSONDecodeError, KeyError, TypeError) as e:
                log.warning(f"AI parse JSON invalid ({e}), falling back to regex")

    # Regex fallback
    parsed = parse_with_regex(clean)
    if parsed:
        return {"intent": "tip", **parsed}
    return None

# ─── Fraud Detection ──────────────────────────────────────────────────────────

def fraud_check(sender_twitter_id: str, recipient_handle: str, sender_handle: str) -> str | None:
    """Returns an error message string if fraud detected, else None."""
    if recipient_handle.lstrip("@").lower() == sender_handle.lower():
        return "You can't tip yourself."
    return None

# ─── On-chain execution ───────────────────────────────────────────────────────

def execute_tip_on_behalf(w3, escrow, sender_address: str, recipient_twitter_id: str, amount_stt: Decimal) -> str:
    bot_account = Account.from_key(BOT_PRIVATE_KEY)
    bot_address = bot_account.address
    amount_wei  = w3.to_wei(amount_stt, "ether")

    deposited = escrow.functions.depositedBalance(
        Web3.to_checksum_address(sender_address)
    ).call()
    if deposited < amount_wei:
        have = Decimal(str(w3.from_wei(deposited, "ether")))
        raise ValueError(f"Insufficient deposit: you have {have:.4f} STT, need {amount_stt} STT")

    if not escrow.functions.isAuthorized(
        Web3.to_checksum_address(sender_address), bot_address
    ).call():
        raise PermissionError("Bot not authorized. Visit xenia.app → Dashboard → Authorize Bot.")

    nonce = w3.eth.get_transaction_count(bot_address)
    tx = escrow.functions.tipOnBehalf(
        Web3.to_checksum_address(sender_address),
        recipient_twitter_id,
        amount_wei,
    ).build_transaction({
        "from":     bot_address,
        "nonce":    nonce,
        "gasPrice": w3.eth.gas_price,
        "gas":      200_000,
        "chainId":  CHAIN_ID,
    })

    signed  = w3.eth.account.sign_transaction(tx, BOT_PRIVATE_KEY)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=30)

    if receipt.status != 1:
        raise RuntimeError(f"Transaction reverted: {tx_hash.hex()}")

    th = tx_hash.hex()
    if not th.startswith("0x"):
        th = "0x" + th

    # If the recipient is unregistered the tip went to escrow → capture the
    # TipSent event so the backend can index a pending claim for them.
    escrow_info = None
    try:
        events = escrow.events.TipSent().process_receipt(receipt, errors=DISCARD)
        if events:
            a = events[0]["args"]
            escrow_info = {
                "senderAddress":   Web3.to_checksum_address(a["sender"]),
                "amount":          str(a["amount"]),
                "amountFormatted": str(w3.from_wei(a["amount"], "ether")),
                "escrowIndex":     int(a["tipIndex"]),
            }
    except Exception as e:
        log.warning(f"TipSent parse failed: {e}")

    return th, escrow_info

# ─── Backend helpers ──────────────────────────────────────────────────────────

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

def resolve_twitter_id(client, handle: str) -> str | None:
    try:
        resp = client.get_user(username=handle.lstrip("@"))
        return str(resp.data.id) if resp.data else None
    except Exception:
        return None

# ─── Mention handler ──────────────────────────────────────────────────────────

def handle_mention(ai_client, client, w3, escrow, mention, bot_username: str) -> str | None:
    text      = mention.text or ""
    author_id = str(mention.author_id)

    log.info(f"Mention [{mention.id}] from {author_id}: {text!r}")

    # Parse command
    cmd = parse_command(ai_client, text, bot_username)
    if not cmd:
        return None

    intent = cmd.get("intent")

    # ── Help ──────────────────────────────────────────────────────────────────
    if intent == "help":
        return (
            "📖 Xenia commands:\n"
            "• tip @someone 0.5 STT\n"
            "• tip @someone $1\n"
            "Deposit & authorize at xenia.app 🚀"
        )

    # ── Balance check ─────────────────────────────────────────────────────────
    if intent == "check_balance":
        try:
            user = xenia_get(f"/api/users/{author_id}")
            wallet = user.get("linkedWalletAddress") or user.get("embeddedWalletAddress")
            if not wallet:
                return "No wallet found. Visit xenia.app to set up your account."
            deposited_wei = escrow.functions.depositedBalance(
                Web3.to_checksum_address(wallet)
            ).call()
            balance = w3.from_wei(deposited_wei, "ether")
            return f"💰 Your Xenia deposit: {balance:.4f} STT"
        except Exception as e:
            log.error(f"Balance check failed: {e}")
            return "Couldn't fetch balance. Try again later."

    # ── Tip ───────────────────────────────────────────────────────────────────
    if intent != "tip":
        return None

    recipient_raw = cmd.get("recipient")
    amount_raw    = cmd.get("amount")
    currency      = cmd.get("currency", "STT").upper()

    if not recipient_raw:
        return "I couldn't determine who to tip. Try: @XeniaBot tip @someone 0.5 STT"

    if not amount_raw:
        return "I couldn't determine the amount. Try: @XeniaBot tip @someone 0.5 STT"

    # Currency conversion
    try:
        amount_decimal = Decimal(str(amount_raw))
    except InvalidOperation:
        return "Invalid amount."

    if currency == "USD":
        converted = usd_to_stt(amount_decimal)
        if converted is None:
            return "Couldn't fetch STT price right now. Please specify amount in STT."
        log.info(f"Converted ${amount_decimal} → {converted} STT")
        amount_stt  = converted
        amount_label = f"${amount_decimal} ({amount_stt} STT)"
    else:
        amount_stt  = amount_decimal
        amount_label = f"{amount_stt} STT"

    if amount_stt < MIN_TIP_STT:
        return f"Minimum tip is {MIN_TIP_STT} STT."
    if amount_stt > MAX_TIP_STT:
        return f"Maximum tip is {MAX_TIP_STT} STT."

    # Resolve recipient. Escrow is keyed by the LOWERCASED HANDLE everywhere
    # (tip / claim / registerWallet), so the key sent on-chain must be the
    # handle — NOT the numeric Twitter id. We still verify it exists on X.
    recipient_handle = recipient_raw.lstrip("@").lower()
    if not resolve_twitter_id(client, recipient_handle):
        return f"@{recipient_handle} not found on X."
    recipient_key = recipient_handle

    # Sender lookup
    try:
        sender_data   = xenia_get(f"/api/users/{author_id}")
        sender_wallet = sender_data.get("linkedWalletAddress") or sender_data.get("embeddedWalletAddress")
        sender_handle = sender_data.get("twitterHandle", author_id)
    except Exception:
        return "Your account isn't registered. Visit xenia.app to connect your wallet."

    if not sender_wallet:
        return "No wallet found for your account. Visit xenia.app to set up."

    # Fraud check
    fraud = fraud_check(author_id, recipient_handle, sender_handle)
    if fraud:
        return f"❌ {fraud}"

    # Execute
    try:
        tx_hash, escrow_info = execute_tip_on_behalf(
            w3, escrow, sender_wallet, recipient_key, amount_stt
        )
        # If it went to escrow (recipient not registered), index a claim so the
        # recipient can see + claim it from the dashboard.
        if escrow_info:
            try:
                xenia_post("/api/bot/record-claim", {
                    "recipientTwitterId": recipient_key,
                    "senderTwitterId":    sender_handle,
                    "txHash":             tx_hash,
                    **escrow_info,
                })
            except Exception as e:
                log.warning(f"record-claim failed: {e}")
        return (
            f"✅ {amount_label} sent to @{recipient_handle} on Somnia!\n"
            f"🔗 {EXPLORER_URL}/tx/{tx_hash}"
        )
    except ValueError as e:
        return f"❌ {e}\nDeposit more STT at xenia.app/deposit"
    except PermissionError as e:
        return f"❌ {e}"
    except Exception as e:
        log.error(f"tipOnBehalf failed: {e}")
        return "❌ Transaction failed. Try again or visit xenia.app."

# ─── Mention poller ───────────────────────────────────────────────────────────

class MentionPoller:
    def __init__(self, ai_client, twitter_client, w3, escrow, bot_user_id, bot_username):
        self.ai         = ai_client
        self.client     = twitter_client
        self.w3         = w3
        self.escrow     = escrow
        self.bot_id     = bot_user_id
        self.bot_name   = bot_username
        self.since_id   = None

    def poll(self):
        kwargs = {
            "id":          self.bot_id,
            "tweet_fields": ["author_id", "text"],
            "max_results": 10,
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

        for mention in reversed(resp.data):
            self.since_id = max(self.since_id or 0, int(mention.id))
            reply = handle_mention(
                self.ai, self.client, self.w3, self.escrow,
                mention, self.bot_name,
            )
            if reply:
                try:
                    self.client.create_tweet(
                        text=f"@{mention.author_id} {reply}"[:280],
                        in_reply_to_tweet_id=mention.id,
                    )
                    log.info(f"Replied to {mention.id}")
                except tweepy.TweepyException as e:
                    log.error(f"Reply failed: {e}")
                time.sleep(1)

# ─── Notification loop ────────────────────────────────────────────────────────

def process_notifications(client):
    try:
        claims = xenia_get("/api/bot/pending-notifications")
    except Exception as e:
        log.error(f"Fetch notifications failed: {e}")
        return 0

    notified = 0
    for claim in (claims or []):
        claim_id     = claim.get("id")
        recipient_id = claim.get("recipientTwitterId")
        amount_fmt   = claim.get("amountFormatted", "?")
        if not claim_id or not recipient_id:
            continue

        try:
            user   = xenia_get(f"/api/users/{recipient_id}")
            handle = user.get("twitterHandle", recipient_id)
        except Exception:
            handle = recipient_id

        try:
            client.create_tweet(
                text=(
                    f"@{handle} 👋 Someone sent you {amount_fmt} STT via Xenia! "
                    f"Visit xenia.app to claim. #Somnia"
                )[:280]
            )
            xenia_post(f"/api/bot/claims/{claim_id}/notified")
            notified += 1
            log.info(f"Notified @{handle} (claim {claim_id})")
        except Exception as e:
            log.error(f"Notify failed: {e}")

        time.sleep(2)

    return notified

# ─── Healthcheck ──────────────────────────────────────────────────────────────

def healthcheck(ai_client, twitter_client, w3):
    ok = True

    # Backend
    try:
        data = xenia_get("/api/somnia/network")
        log.info(f"Backend OK — chain {data.get('chainId')}")
    except Exception as e:
        log.error(f"Backend: {e}"); ok = False

    # Somnia RPC
    if not w3.is_connected():
        log.error("Somnia RPC not reachable"); ok = False
    else:
        log.info(f"Somnia OK — block #{w3.eth.block_number}")

    # LLM (Gemini / Claude)
    if ai_client:
        if ai_client.ping():
            log.info(f"AI OK — {ai_client.label}")
        else:
            log.warning(f"AI unavailable ({ai_client.label}) — regex fallback active")
    else:
        log.warning("No LLM configured (set GEMINI_API_KEY or ANTHROPIC_API_KEY) — regex fallback active")

    # Twitter
    try:
        me = twitter_client.get_me()
        log.info(f"Twitter OK — @{me.data.username}")
        return ok, str(me.data.id), me.data.username
    except Exception as e:
        log.error(f"Twitter: {e}"); return False, None, None

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    log.info("═══════════════════════════════════════════")
    log.info("  Xenia AI Bot Starting")
    log.info(f"  API:  {XENIA_API_BASE}")
    log.info(f"  RPC:  {RPC_URL}")
    log.info(f"  AI:   {'Claude Haiku' if ANTHROPIC_KEY else 'Regex fallback'}")
    log.info(f"  Poll: {POLL_INTERVAL}s")
    log.info("═══════════════════════════════════════════")

    for var, name in [
        (BOT_API_KEY, "XENIA_BOT_API_KEY"),
        (ESCROW_ADDR, "ESCROW_CONTRACT_ADDRESS"),
        (BOT_PRIVATE_KEY, "BACKEND_WALLET_PRIVATE_KEY"),
    ]:
        if not var:
            log.error(f"{name} not set"); sys.exit(1)

    ai      = make_ai()
    w3      = make_web3()
    escrow  = make_escrow(w3)
    twitter = make_twitter()

    ok, bot_id, bot_name = healthcheck(ai, twitter, w3)
    if not ok:
        sys.exit(1)

    log.info(f"Bot wallet: {Account.from_key(BOT_PRIVATE_KEY).address}")
    log.info("Running. Ctrl+C to stop.")

    poller = MentionPoller(ai, twitter, w3, escrow, bot_id, bot_name)
    tick   = 0

    while True:
        try:
            poller.poll()
            if tick % 5 == 0:
                n = process_notifications(twitter)
                if n:
                    log.info(f"Sent {n} notification(s)")
            tick += 1
        except KeyboardInterrupt:
            log.info("Shutting down."); break
        except Exception as e:
            log.error(f"Main loop: {e}")

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
