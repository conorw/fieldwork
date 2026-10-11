import dataset from "../../training/dataset.py";
import download from "../../training/download.py";
import exportOnnx from "../../training/export_onnx.py";
import globalMerge from "../../training/global_merge.py";
import initPy from "../../training/__init__.py";
import requirements from "../../training/requirements.txt";
import runJob from "../../training/run_job.py";
import schema from "../../training/schema.py";
import trainLora from "../../training/train_lora.py";
import upload from "../../training/upload.py";
import webhook from "../../training/webhook.py";
import exportScript from "../../scripts/export_browser_onnx.py";

/** Posted by the GPU job after the browser ONNX repo and manifest are published. */
export const FINISH_ONNX_WEBHOOK_PY = `import json, os, sys, urllib.request
fail = len(sys.argv) > 1 and sys.argv[1] == "fail"
secret = os.environ.get("TRAIN_WEBHOOK_SECRET", "")
url = os.environ["TRAIN_WEBHOOK_URL"]
version = os.environ.get("ONNX_VERSION", "onnx")
adapter = os.environ.get("GLOBAL_ADAPTER_PUBLIC_URL", "").rstrip("/") + "/"
job_id = os.environ.get("HF_JOB_ID") or os.environ.get("JOB_ID")
if fail:
    body = {
        "status": "failure",
        "locationId": os.environ["TEACHER_LOCATION_ID"],
        "error": "On-device model publish failed",
        "jobId": job_id,
    }
else:
    body = {
        "status": "success",
        "locationId": os.environ["TEACHER_LOCATION_ID"],
        "adapterUrl": adapter,
        "adapterVersion": version,
        "exportMode": "onnx",
        "jobId": job_id,
        "globalAdapterUrl": adapter,
        "globalAdapterVersion": version,
    }
data = json.dumps(body).encode()
req = urllib.request.Request(
    url,
    data=data,
    method="POST",
    headers={
        "Content-Type": "application/json",
        "User-Agent": "fieldwork-train/1.0",
        "x-train-webhook-secret": secret,
        "Authorization": "Bearer " + secret,
    },
)
with urllib.request.urlopen(req, timeout=60) as resp:
    print("[teacher] webhook", resp.status, resp.read()[:300])
`;

/** Sources the GPU job copies over the cloned git branch before training. */
export function trainingOverlayFiles(): Record<string, string> {
  return {
    "training/__init__.py": initPy,
    "training/dataset.py": dataset,
    "training/download.py": download,
    "training/export_onnx.py": exportOnnx,
    "training/global_merge.py": globalMerge,
    "training/requirements.txt": requirements,
    "training/run_job.py": runJob,
    "training/schema.py": schema,
    "training/train_lora.py": trainLora,
    "training/upload.py": upload,
    "training/webhook.py": webhook,
    "scripts/export_browser_onnx.py": exportScript,
    "scripts/finish_onnx_webhook.py": FINISH_ONNX_WEBHOOK_PY,
  };
}
