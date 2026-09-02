# Judge0 self-host (Oracle Always Free, 2 OCPU/12GB Ampere A1)

## On the VM

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER   # relog after this

git clone --depth 1 <this-repo-url> chaincode
cd chaincode/deploy/judge0
cp judge0.conf.example judge0.conf
cp db.env.example db.env
# edit judge0.conf: set AUTHN_TOKEN, POSTGRES_PASSWORD, REDIS_PASSWORD (long random strings)
# edit db.env: same POSTGRES_PASSWORD as judge0.conf

docker compose up -d db redis
docker compose up -d
docker compose up -d --scale workers=2   # 1 worker per OCPU; bump if you resize the VM

# sanity check (from the VM — server only binds 127.0.0.1)
curl -s http://localhost:2358/system_info
```

Server binds `127.0.0.1:2358` only — it is not reachable from the internet until you
put a reverse proxy with TLS in front of it (nginx/Caddy). Do not expose port 2358 directly.

## Still needed (manual, needs your Oracle/DNS access — not done here)

1. Provision the Always Free Ampere A1 instance (2 OCPU / 12GB — Oracle cut this from
   4/24 in 2026) in the Oracle console.
2. Point a subdomain at it and terminate TLS with Caddy/nginx in front of port 2358.
4. Set `SELFHOSTED_JUDGE0_URL=https://<your-subdomain>` and
   `JUDGE0_AUTHN_TOKEN=<same value as AUTHN_TOKEN in judge0.conf>` in the backend's
   production env (Vercel).
6. Keep `RAPIDAPI_KEY` set in Vercel too — it's now the fallback, not primary.
7. Hit `/api/execute/:problemId` end to end once both are live.
