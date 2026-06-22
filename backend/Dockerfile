FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    poppler-utils \
    tesseract-ocr \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && pip install --no-cache-dir -r requirements.txt
RUN addgroup --system app && adduser --system --ingroup app app

COPY --chown=app:app . .

RUN mkdir -p data uploads && chown -R app:app /app

EXPOSE 8004
USER app

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=30s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8004/health')" >/dev/null

CMD ["sh", "-c", "python startup.py && uvicorn app.main:app --host 0.0.0.0 --port 8004"]
