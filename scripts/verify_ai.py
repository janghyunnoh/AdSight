"""Live AI smoke test with synthetic samples; never prints keys or model text."""
import argparse
import asyncio
import time
from fastapi import HTTPException
from app.ai import AIClient, InterpretRequest

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("provider", choices=["nvidia"])
    args = parser.parse_args()
    client = AIClient()
    start = time.monotonic()
    try:
        await client.check(args.provider)
        result = await client.interpret(InterpretRequest(provider=args.provider, columns=[
            {"index": 0, "name": "Date", "samples": ["2026-10-01", "2026-10-02"], "dates": True},
            {"index": 1, "name": "Campaign_ID", "samples": ["1001", "1002"], "numeric": True},
            {"index": 2, "name": "Acquisition_Cost", "samples": ["$120", "$150"], "unit": "USD", "numeric": True},
        ]))
        assert len(result["columns"]) == 3
        assert result["summary"].strip()
        print("PASS:", args.provider, "connected; structured summary and", len(result["columns"]), "translated column settings received.")
        print("Elapsed seconds:", round(time.monotonic() - start, 1))
        print("Roles:", ", ".join(item["role"] for item in result["columns"]))
        print("Secrets and response text omitted.")
    except HTTPException as error:
        print("FAIL:", error.status_code, error.detail)
        raise SystemExit(1) from None
    finally:
        await client.http.aclose()

asyncio.run(main())
