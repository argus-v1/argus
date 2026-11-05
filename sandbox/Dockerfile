# Argus test sandbox: runs untrusted PR code with pytest.
# Everything the tests need is baked in at build time; at run time the
# container has no network (see run_tests.py for the full set of limits).
FROM python:3.12-slim

RUN pip install --no-cache-dir pytest==8.3.5

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /work
USER 65534:65534
