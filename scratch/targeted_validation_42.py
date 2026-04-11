
import sys
import os
import json
import time
from pathlib import Path

# Fix paths
sys.path.append('d:/AIOCRM')
sys.path.append('d:/AIOCRM/backend')

from backend.media_engine import get_media_engine

def run_test(name, payload, tenant_id="tenant-primary"):
    print(f"\n>>> RUNNING TEST: {name}")
    engine = get_media_engine()
    
    # Use 'stub-render' provider (RemotionLocalRenderProvider)
    provider_id = "stub-render"
    
    from backend.media_engine import build_render_job
    
    job = build_render_job(
        tenant_id=tenant_id,
        provider=provider_id,
        title=f"Targeted Test: {name}",
        input_payload=payload,
        attachments=[]
    )
    
    engine.store.upsert("render_jobs", job)
    job_id = job["id"]
    print(f"Job created: {job_id}")
    
    # Blocking process
    try:
        result = engine.process_job("render", job_id, payload, tenant_id)
    except Exception as e:
        print(f"Job execution crashed with error: {e}")
    
    # Check final status
    final_job = engine.get_job("render", job_id)
    status = final_job.get("status")
    print(f"Final status: {status}")
    
    if status == "complete":
        print(f"SUCCESS: {name}")
        output_assets = final_job.get("output_asset_ids", [])
        if output_assets:
            asset = engine.get_asset(output_assets[0])
            print(f"Output asset: {asset.get('source_url')}")
        return "PASS", final_job
    else:
        print(f"FAILURE: {name} - Error: {final_job.get('last_error')}")
        return "FAIL", final_job

def main():
    results = {}
    
    # TEST 1 — TTS PATH
    results["TTS"] = run_test("TTS Path", {
        "templateId": "aio_916",
        "scriptPrompt": "Targeted re-validation of the TTS path. Checking if audio is generated and integrated.",
        "includeAudio": True,
        "voiceId": "adam"
    })
    
    # TEST 2 — VAULT AUDIO PATH
    results["Vault Audio"] = run_test("Vault Audio Path", {
        "templateId": "aio_916",
        "audioAssetId": "media-asset-6eff369f4e7f",
        "title": "Vault Audio Targeted Test"
    })
    
    # TEST 3 — REGRESSION
    results["Regression"] = run_test("Regression Check", {
        "templateId": "aio_916",
        "scriptPrompt": "Regression check. TTS only, no images, no b-roll.",
        "includeAudio": True
    })
    
    print("\n" + "="*60)
    print("FINAL SUMMARY")
    print("="*60)
    all_pass = True
    for test, (status, _) in results.items():
        print(f"{test} -> {status}")
        if status != "PASS":
            all_pass = False

    print("\nOVERALL RESULT: " + ("PASS" if all_pass else "FAIL"))

if __name__ == "__main__":
    main()
