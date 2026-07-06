# HireView backend — FastAPI on Cloud Run
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# libsql, bs4, rank-bm25 ship wheels — no compiler/build tools needed.
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Run as a non-root user.
RUN useradd --create-home appuser && chown -R appuser /app
USER appuser

# Cloud Run sets PORT (usually 8080). Bind to it; exec so uvicorn receives signals.
ENV PORT=8080
EXPOSE 8080
CMD exec uvicorn api:app --host 0.0.0.0 --port ${PORT}
