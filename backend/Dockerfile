FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

COPY ./app /app/app
COPY requirements.txt /app/

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

EXPOSE 8000

CMD ["gunicorn", "-b", "0.0.0.0:8000", "app.main:app"]
