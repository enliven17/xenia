"""
Thin client for the Xenia × Somnia Network API.

Calls the hosted skill API and prints formatted output.
No scraping logic, no private keys, safe to publish.
"""

import argparse
import json
import os
import sys
import time
from typing import Any, Dict

import requests


def get_api_base() -> str:
    env_base = os.getenv("XENIA_SOMNIA_API_BASE")
    if env_base:
        return env_base.rstrip("/")
    return "https://skill.xenia.app"


def get_rpc_url() -> str:
    return os.getenv("SOMNIA_RPC_URL", "https://dream-rpc.somnia.network")


def call_api(path: str, params: Dict[str, Any]) -> Dict[str, Any]:
    base = get_api_base()
    url = f"{base}{path}"
    try:
        resp = requests.get(url, params=params, timeout=30)
    except requests.RequestException as exc:
        return {"ok": False, "error": f"Network error: {exc}"}

    if resp.status_code != 200:
        return {"ok": False, "error": f"HTTP {resp.status_code}: {resp.text}"}

    try:
        return resp.json()
    except Exception as exc:
        return {"ok": False, "error": f"Invalid JSON: {exc}"}


def call_rpc(method: str, params: list = None) -> Any:
    """Direct JSON-RPC call to Somnia node."""
    payload = {
        "jsonrpc": "2.0",
        "method": method,
        "params": params or [],
        "id": 1,
    }
    try:
        resp = requests.post(get_rpc_url(), json=payload, timeout=10)
        data = resp.json()
        if "error" in data:
            return {"ok": False, "error": data["error"]}
        return {"ok": True, "result": data.get("result")}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def parse_args(argv: Any = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Xenia × Somnia Network API client")
    p.add_argument(
        "--mode",
        required=True,
        choices=[
            "metrics_basic",
            "metrics_block",
            "metrics_address",
            "pending_tips",
            "somnia",
        ],
        help="Which mode to run.",
    )
    p.add_argument("--blocks", type=int, help="Recent blocks for metrics_block.")
    p.add_argument("--address", type=str, help="Address for balance/tx lookup.")
    p.add_argument("--twitter-id", type=str, help="Twitter ID for pending_tips mode.")
    p.add_argument(
        "--analysis-type",
        type=str,
        help=(
            "Somnia analysis type: tvl_rank, dapp_activity, tip_leaderboard, "
            "network_metrics, social_hype"
        ),
    )
    p.add_argument("--interval", type=str, default="24h")
    p.add_argument("--timezone", type=str, default="UTC")
    return p.parse_args(argv)


def wei_to_stt(wei: int) -> str:
    return f"{wei / 1e18:.6f} STT"


def main(argv: Any = None) -> int:
    args = parse_args(argv)

    if args.mode == "metrics_basic":
        # Block number + gas price direct from RPC
        block = call_rpc("eth_blockNumber")
        gas = call_rpc("eth_gasPrice")

        if not block.get("ok") or not gas.get("ok"):
            print(json.dumps({"ok": False, "error": "RPC error"}))
            return 1

        block_num = int(block["result"], 16)
        gas_gwei = int(gas["result"], 16) / 1e9

        result = {
            "ok": True,
            "network": "Somnia Shannon Testnet",
            "chain_id": 50312,
            "latest_block": block_num,
            "gas_price_gwei": round(gas_gwei, 4),
            "rpc": get_rpc_url(),
        }
        print(json.dumps(result, indent=2))

    elif args.mode == "metrics_address":
        if not args.address:
            print(json.dumps({"ok": False, "error": "address required"}))
            return 1

        balance = call_rpc("eth_getBalance", [args.address, "latest"])
        tx_count = call_rpc("eth_getTransactionCount", [args.address, "latest"])

        if not balance.get("ok"):
            print(json.dumps(balance))
            return 1

        wei = int(balance["result"], 16)
        nonce = int(tx_count["result"], 16) if tx_count.get("ok") else "N/A"

        result = {
            "ok": True,
            "address": args.address,
            "balance_stt": wei_to_stt(wei),
            "balance_wei": wei,
            "tx_count": nonce,
        }
        print(json.dumps(result, indent=2))

    elif args.mode == "pending_tips":
        if not args.twitter_id:
            print(json.dumps({"ok": False, "error": "twitter-id required"}))
            return 1
        result = call_api("/api/somnia/pending/" + args.twitter_id, {})
        print(json.dumps(result, indent=2))

    elif args.mode == "somnia":
        if not args.analysis_type:
            print(json.dumps({"ok": False, "error": "analysis-type required"}))
            return 1
        params = {
            "t": args.analysis_type,
            "interval": args.interval,
            "tz": args.timezone,
        }
        result = call_api("/api/somnia/analysis", params)
        if result.get("ok") and result.get("formatted_table"):
            print(result["formatted_table"], end="")
            return 0
        print(json.dumps(result, indent=2))

    else:
        print(json.dumps({"ok": False, "error": "unknown mode"}))
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
