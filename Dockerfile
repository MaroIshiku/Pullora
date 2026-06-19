FROM python:3.12-slim

ARG APP_VERSION=0.1.0
ARG APP_BUILD_SHA=dev

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_DATA_DIR=/data \
    DOWNLOAD_DIR=/downloads \
    APP_VERSION=${APP_VERSION} \
    APP_BUILD_SHA=${APP_BUILD_SHA}

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

RUN mkdir -p /data /downloads /run/secrets

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
