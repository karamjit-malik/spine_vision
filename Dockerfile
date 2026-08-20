# Node and Python in one image, because the bridges call the diagnostic scripts
# with child_process.execFile() — keeping them in-process avoids turning the ML
# layer into a network hop.
FROM node:20-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 python3-pip python3-venv curl \
      libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Torch from the CPU index. The default wheel carries the CUDA runtime and is
# roughly 2.5 GB, none of which a CPU-only host can use.
# ultralytics depends on opencv-python (not the headless build), which links
# against libGL — hence libgl1/libglib2.0-0 above.
COPY ml/requirements.txt ./ml/requirements.txt
RUN python3 -m venv /opt/venv \
 && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
 && /opt/venv/bin/pip install --no-cache-dir \
      --extra-index-url https://download.pytorch.org/whl/cpu \
      -r ml/requirements.txt

COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

COPY ml/ ./ml/
COPY backend/ ./backend/

# Absolute, so they do not depend on which directory the process starts from.
ENV PYTHON_PATH=/opt/venv/bin/python3 \
    ML_DIR=/app/ml \
    NODE_ENV=production

WORKDIR /app/backend
EXPOSE 5001
# prestart pulls the checkpoint before the server binds.
CMD ["npm", "start"]
