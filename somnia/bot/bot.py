"""
Xenia Twitter Bot
-----------------
Watches for pending escrow tips in the Xenia backend and notifies
recipients via Twitter/X mention.

Environment variables (see .env.example):
  XENIA_API_BASE         - Backend URL (default: https://xenia.app)
  XENIA_BOT_API_KEY      - Extension API key for bot user
  TWITTER_API_KEY        - X Developer App API key
  TWITTER_API_SECRET
  TWITTER_ACCESS_TOKEN   - Bot account access token
  TWITTER_ACCESS_SECRET
  POLL_INTERVAL          - Seconds between checks (default: 60)
"""

import os
import sys
import time
import logging
from datetime import datetime

import requests
import tweepy

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("xenia-bot")


# ─── Config ───────────────────────────────────────────────────────────────────

XENIA_API_BASE = os.getenv("XENIA_API_BASE", "https://xenia.app").rstrip("/")
BOT_API_KEY    = os.getenv("XENIA_BOT_API_KEY", "")
POLL_INTERVAL  = int(os.getenv("POLL_INTERVAL", "60"))

TWITTER_API_KEY       = os.getenv("TWITTER_API_KEY", "")
TWITTER_API_SECRET    = os.getenv("TWITTER_API_SECRET", "")
TWITTER_ACCESS_TOKEN  = os.getenv("TWITTER_ACCESS_TOKEN", "")
TWITTER_ACCESS_SECRET = os.getenv("TWITTER_ACCESS_SECRET", "")


# ─── Clients ──────────────────────────────────────────────────────────────────

def make_twitter_client() -> tweepy.Client:
    return tweepy.Client(
        consumer_key=TWITTER_API_KEY,
        consumer_secret=TWITTER_API_SECRET,
        access_token=TWITTER_ACCESS_TOKEN,
        access_token_secret=TWITTER_ACCESS_SECRET,
        wait_on_rate_limit=True,
    )


def xenia_request(path: str, method: str = "GET", json: dict = None) -> dict:
    url = f"{XENIA_API_BASE}{path}"
    headers = {
        "X-Extension-Key": BOT_API_KEY,
        "Content-Type": "application/json",
    }
    resp = requests.request(method, url, headers=headers, json=json, timeout=15)
    resp.raise_for_status()
    return resp.json()


# ─── Notification Logic ───────────────────────────────────────────────────────

NOTIFICATION_TEMPLATE = (
    "Hey @{handle}! 👋 Someone sent you a tip on Somnia Network via Xenia. "
    "Connect your wallet at xenia.app to claim it. "
    "#Somnia #Xenia"
)


def notify_recipient(client: tweepy.Client, handle: str, claim_id: int) -> bool:
    """Send a Twitter mention to the recipient. Returns True on success."""
    message = NOTIFICATION_TEMPLATE.format(handle=handle)
    try:
        response = client.create_tweet(text=message)
        log.info(f"Notified @{handle} (claim {claim_id}), tweet_id={response.data['id']}")
        return True
    except tweepy.TweepyException as e:
        log.error(f"Failed to notify @{handle}: {e}")
        return False


def process_pending_claims(client: tweepy.Client) -> int:
    """
    Fetch unnotified pending claims from backend and send Twitter mentions.
    Returns the number of successfully notified claims.
    """
    try:
        claims = xenia_request("/api/bot/pending-notifications")
    except requests.RequestException as e:
        log.error(f"Failed to fetch pending claims: {e}")
        return 0

    if not claims:
        return 0

    notified = 0
    for claim in claims:
        claim_id      = claim.get("id")
        recipient_id  = claim.get("recipientTwitterId")
        amount_fmt    = claim.get("amountFormatted", "?")

        if not claim_id or not recipient_id:
            continue

        # Resolve handle from recipient twitterId via API
        try:
            user_data = xenia_request(f"/api/users/{recipient_id}")
            handle = user_data.get("twitterHandle", recipient_id)
        except Exception:
            handle = recipient_id

        success = notify_recipient(client, handle, claim_id)

        if success:
            # Mark as notified in backend
            try:
                xenia_request(f"/api/bot/claims/{claim_id}/notified", method="POST")
                notified += 1
            except requests.RequestException as e:
                log.warning(f"Marked tweet sent but failed to update DB for claim {claim_id}: {e}")

        # Respect Twitter rate limits
        time.sleep(2)

    return notified


# ─── Healthcheck ──────────────────────────────────────────────────────────────

def healthcheck() -> bool:
    """Verify backend and Twitter credentials on startup."""
    ok = True

    # Backend
    try:
        data = xenia_request("/api/somnia/network")
        log.info(f"Backend OK — chain {data.get('chainId')}, RPC {data.get('rpcUrl')}")
    except Exception as e:
        log.error(f"Backend healthcheck failed: {e}")
        ok = False

    # Twitter credentials
    if not all([TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET]):
        log.error("Missing Twitter API credentials in environment")
        ok = False
    else:
        try:
            client = make_twitter_client()
            me = client.get_me()
            log.info(f"Twitter OK — logged in as @{me.data.username}")
        except Exception as e:
            log.error(f"Twitter auth failed: {e}")
            ok = False

    return ok


# ─── Main Loop ────────────────────────────────────────────────────────────────

def main():
    log.info("═══════════════════════════════")
    log.info("  Xenia Bot Starting")
    log.info(f"  API: {XENIA_API_BASE}")
    log.info(f"  Poll interval: {POLL_INTERVAL}s")
    log.info("═══════════════════════════════")

    if not BOT_API_KEY:
        log.error("XENIA_BOT_API_KEY not set. Exiting.")
        sys.exit(1)

    if not healthcheck():
        log.error("Healthcheck failed. Fix the errors above and restart.")
        sys.exit(1)

    twitter_client = make_twitter_client()
    log.info("Bot is running. Ctrl+C to stop.")

    while True:
        try:
            count = process_pending_claims(twitter_client)
            if count:
                log.info(f"Notified {count} recipient(s)")
        except KeyboardInterrupt:
            log.info("Shutting down.")
            break
        except Exception as e:
            log.error(f"Unexpected error in main loop: {e}")

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
