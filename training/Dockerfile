# Optional image for HF Jobs if you build/push your own.
# Default kickoff uses huggingface/transformers-pytorch-gpu + git clone.
FROM huggingface/transformers-pytorch-gpu:latest

WORKDIR /app
COPY requirements.txt /app/training/requirements.txt
RUN pip install --no-cache-dir -r /app/training/requirements.txt

COPY . /app/training
ENV PYTHONPATH=/app
ENV HF_HOME=/tmp/hf

CMD ["python", "-m", "training.run_job"]
