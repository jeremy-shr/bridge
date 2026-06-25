"""Bridge brains — Qwen2.5-32B served by vLLM on Modal as an OpenAI-compatible
API. Weights cache to a Modal Volume so only the first boot pays the download.

    modal deploy llm_modal.py        # prints  https://<workspace>--bridge-llm-serve.modal.run

Then in backend/.env:
    OPENAI_BASE_URL=https://<...>-serve.modal.run/v1
    OPENAI_API_KEY=bridge-key
    MODEL=Qwen/Qwen2.5-32B-Instruct

Recipe follows Modal's current vLLM example (vllm==0.21.0, web_server + subprocess).
"""
import subprocess
import modal

MODEL_NAME = "Qwen/Qwen2.5-32B-Instruct"  # drop to Qwen2.5-14B-Instruct if first boot drags
GPU = "H100"                              # fits 32B in 80GB; use "H200" for more headroom
VLLM_PORT = 8000
API_KEY = "bridge-key"                    # must match OPENAI_API_KEY in .env

vllm_image = (
    modal.Image.from_registry("nvidia/cuda:12.9.0-devel-ubuntu22.04", add_python="3.12")
    .entrypoint([])
    .uv_pip_install("vllm==0.21.0")
    .env({"HF_XET_HIGH_PERFORMANCE": "1", "VLLM_LOG_STATS_INTERVAL": "1"})
)

hf_cache = modal.Volume.from_name("bridge-hf-cache", create_if_missing=True)
vllm_cache = modal.Volume.from_name("bridge-vllm-cache", create_if_missing=True)

app = modal.App("bridge-llm")


@app.function(
    image=vllm_image,
    gpu=GPU,
    volumes={"/root/.cache/huggingface": hf_cache, "/root/.cache/vllm": vllm_cache},
    timeout=86400,            # 24h — the server runs for the duration
    scaledown_window=600,     # stays warm while the loop ticks (every TICK_SECONDS); auto-stops ~10min idle
)
@modal.concurrent(max_inputs=64)
@modal.web_server(port=VLLM_PORT, startup_timeout=900)
def serve():
    cmd = (
        f"vllm serve {MODEL_NAME} "
        f"--host 0.0.0.0 --port {VLLM_PORT} "
        f"--api-key {API_KEY} "
        f"--served-model-name {MODEL_NAME} "
        f"--max-model-len 16384 --gpu-memory-utilization 0.90"
    )
    subprocess.Popen(cmd, shell=True)
