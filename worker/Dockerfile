FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY REQUIREMENTS.txt .
RUN pip install --no-cache-dir -r REQUIREMENTS.txt

COPY . .

CMD ["python", "main.py"]
