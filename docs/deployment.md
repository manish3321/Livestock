# Deployment (DigitalOcean VPS)

Target: a single droplet (2 GB RAM is enough to start) running Docker Compose — PostgreSQL, MongoDB (GridFS for receipts), the API, and nginx serving the web build. Estimated cost matches the brief (NPR 3,000–5,000/month).

## One-time setup

```bash
# On the droplet (Ubuntu 24.04)
apt update && apt install -y docker.io docker-compose-v2 git
git clone <repo> /opt/farm && cd /opt/farm

# Secrets
cat > .env <<'EOF'
JWT_SECRET=<64 random chars>          # openssl rand -base64 48
CORS_ORIGIN=https://farm.example.com
STORAGE_DRIVER=mongodb
MONGODB_URI=mongodb://mongo:27017/farm
MONGODB_BUCKET=farm-files
EOF
```

## Deploy / update

```bash
cd /opt/farm && git pull
docker compose build api web
docker compose up -d
docker compose exec api npx prisma db seed   # first deploy only
```

The API container runs `prisma migrate deploy` on start, so schema changes apply automatically. Health checks: `GET /health/live` and `GET /health/ready`.

## TLS

Put the droplet behind a DigitalOcean load balancer with a managed certificate, or run Caddy/certbot in front of the `web` container (ports 80/443 → web:80).

## Production hardening checklist

- [ ] `JWT_SECRET` is unique and 48+ bytes; never the example value
- [ ] Postgres port 5432 is not exposed publicly (remove the `ports` mapping from `db` in production)
- [ ] `SEED_PASSWORD` changed and seed users' passwords rotated after first login
- [ ] Daily `pg_dump` cron to DigitalOcean Spaces or MongoDB dump of GridFS
- [ ] `STORAGE_DRIVER=mongodb` with `MONGODB_URI` for uploads/exports
- [ ] `FCM_SERVICE_ACCOUNT_JSON` set when push notifications ship
