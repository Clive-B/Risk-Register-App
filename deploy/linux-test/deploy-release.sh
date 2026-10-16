#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 3 ]]; then
  echo "Usage: deploy-release.sh RELEASE_ID PACKAGE_TGZ SEED_DUMP" >&2
  exit 2
fi

release_id="$1"
package_tgz="$2"
seed_dump="$3"
root="/development/playground/nca-grc-test"
release_dir="$root/releases/$release_id"
env_file="$root/.env"
db_name="nca_grc_live_test"
db_user="nca_grc_live_test"
application_url="https://dev-env.corp.nca.org.gh:3054"
local_model_name="Qwen2.5-0.5B-Instruct-Q4_K_M"
local_model_file="qwen2.5-0.5b-instruct-q4_k_m.gguf"
local_model_url="https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/872f8a96064a1242ac3a3359cad77c3042548405/qwen2.5-0.5b-instruct-q4_k_m.gguf"
local_model_sha256="74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db"
embedding_model_file="all-MiniLM-L6-v2-Q4_K_M.gguf"
embedding_model_url="https://huggingface.co/second-state/All-MiniLM-L6-v2-Embedding-GGUF/resolve/e2cd77b26b3b606e353cf34ad3a635143d14b5de/all-MiniLM-L6-v2-Q4_K_M.gguf"
embedding_model_sha256="2ec4cee28a27a9c973d5f5230930d6ef6e52694bd2bc71be26a9bef5b1d755e6"

umask 077
mkdir -p "$root/releases" "$root/backups" "$root/models" "$release_dir"
tar -xzf "$package_tgz" -C "$release_dir"
# Static assets are mounted read-only into an unprivileged Nginx worker.
find "$release_dir/frontend" -type d -exec chmod 755 {} +
find "$release_dir/frontend" -type f -exec chmod 644 {} +
cp "$release_dir/deploy/linux-test/Dockerfile.api" "$release_dir/Dockerfile.api"
cp "$release_dir/deploy/linux-test/docker-compose.yml" "$release_dir/docker-compose.yml"
cp "$release_dir/deploy/linux-test/nginx.conf" "$release_dir/nginx.conf"

random_hex() {
  od -An -N"$1" -tx1 /dev/urandom | tr -d ' \n'
}

if [[ ! -f "$env_file" ]]; then
  db_password="$(random_hex 24)"
  jwt_secret="$(random_hex 48)"
  communication_key="$(random_hex 48)"
  cat > "$env_file" <<EOF
NODE_ENV=production
PORT=3062
API_HOST=0.0.0.0
TRUST_PROXY_HOPS=1
JSON_BODY_LIMIT=12mb
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=$db_name
DB_USER=$db_user
DB_PASSWORD=$db_password
DB_POOL_MAX=20
DB_CONNECTION_TIMEOUT_MS=10000
DB_IDLE_TIMEOUT_MS=30000
DB_STATEMENT_TIMEOUT_MS=30000
DB_APPLICATION_NAME=nca-grc-live-test
DB_SSL=false
JWT_SECRET=$jwt_secret
COMMUNICATION_ENCRYPTION_KEY=$communication_key
FRONTEND_URL=$application_url
CORS_ORIGINS=$application_url
PASSWORD_MIN_LENGTH=12
PASSWORD_HISTORY_COUNT=5
PASSWORD_EXPIRY_DAYS=90
PASSWORD_EXPIRY_WARNING_DAYS=14
PASSWORD_RESET_MINUTES=30
ACCOUNT_LOCKOUT_ATTEMPTS=5
ACCOUNT_LOCKOUT_MINUTES=30
ACCESS_TOKEN_MINUTES=15
REFRESH_TOKEN_DAYS=7
WORKPLAN_ORIGINAL_RETENTION_DAYS=365
DEFAULT_TEMP_PASSWORD=
TEST_USER_PASSWORD=
SMTP_HOST=dev-mailpit
SMTP_PORT=1025
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=NCA GRC <no-reply@nca.org.gh>
SMTP_SECURE=false
SMTP_ALLOW_SELF_SIGNED=true
MAIL_FROM=no-reply@nca.org.gh
DISABLE_COMMUNICATION_WORKER=false
EMAIL_QUEUE_BATCH_SIZE=20
EMAIL_QUEUE_INTERVAL_MS=30000
EMAIL_QUEUE_ALERT_THRESHOLD=50
AI_PROVIDER=disabled
AI_MODEL=
AI_API_KEY=
AI_BASE_URL=
AI_TIMEOUT_MS=20000
AI_ROUTER_TIMEOUT_MS=650
AI_READINESS_TIMEOUT_MS=60000
AI_MAX_OUTPUT_TOKENS=900
AI_GOVERNED_CONTEXT_EXTERNAL_ALLOWED=false
AI_VOICE_ENABLED=true
AI_VOICE_GREETING_ENABLED=true
AI_VOICE_AUTO_START_ENABLED=true
AI_PROCESSING_REGION=unverified
AI_HOSTING_REGION=on-premises-test-environment
AI_AUDIT_RETENTION_POLICY=test-environment-policy
EOF
  chmod 600 "$env_file"
else
  db_password="$(sed -n 's/^DB_PASSWORD=//p' "$env_file" | head -n 1)"
fi

set_env_value() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$env_file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$env_file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$env_file"
  fi
}

# General knowledge is served by an internal-only CPU model. Governed user
# context remains on the deterministic local path and is not sent to the model.
set_env_value AI_PROVIDER llamacpp
set_env_value AI_MODEL "$local_model_name"
set_env_value AI_API_KEY ""
set_env_value AI_BASE_URL http://127.0.0.1:8080
set_env_value AI_EMBEDDING_BASE_URL http://127.0.0.1:8081
set_env_value AI_EMBEDDING_MODEL all-MiniLM-L6-v2-Q4_K_M
set_env_value AI_TIMEOUT_MS 20000
set_env_value AI_ROUTER_TIMEOUT_MS 400
set_env_value AI_READINESS_TIMEOUT_MS 60000
set_env_value AI_MAX_OUTPUT_TOKENS 48
set_env_value AI_GOVERNED_CONTEXT_EXTERNAL_ALLOWED false
set_env_value AI_PROCESSING_REGION on-premises-test-environment
set_env_value AI_HOSTING_REGION on-premises-test-environment
chmod 600 "$env_file"

if [[ -z "$db_password" ]]; then
  echo "DB_PASSWORD is missing from the protected environment file." >&2
  exit 1
fi

role_exists="$(docker exec dev-postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT 1 FROM pg_roles WHERE rolname='"'"'nca_grc_live_test'"'"'"' | tr -d '\r')"
if [[ "$role_exists" != "1" ]]; then
  docker exec dev-postgres sh -lc "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"CREATE ROLE $db_user LOGIN PASSWORD '$db_password'\""
else
  docker exec dev-postgres sh -lc "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"ALTER ROLE $db_user PASSWORD '$db_password'\"" >/dev/null
fi

database_exists="$(docker exec dev-postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT 1 FROM pg_database WHERE datname='"'"'nca_grc_live_test'"'"'"' | tr -d '\r')"
new_database=false
if [[ "$database_exists" != "1" ]]; then
  docker exec dev-postgres sh -lc "createdb -U \"\$POSTGRES_USER\" -O $db_user $db_name"
  new_database=true
else
  backup_file="$root/backups/${db_name}-before-${release_id}.dump"
  docker exec dev-postgres sh -lc "pg_dump -U \"\$POSTGRES_USER\" -d $db_name -Fc" > "$backup_file"
  sha256sum "$backup_file" > "$backup_file.sha256"
fi

if [[ "$new_database" == "true" ]]; then
  container_seed="/tmp/nca-grc-${release_id}.dump"
  docker cp "$seed_dump" "dev-postgres:$container_seed"
  docker exec -e "PGPASSWORD=$db_password" dev-postgres pg_restore -h 127.0.0.1 -v -U "$db_user" -d "$db_name" --no-owner --no-privileges --exit-on-error "$container_seed"
  docker exec dev-postgres rm -f "$container_seed"
fi

export RELEASE_ID="$release_id"
cd "$release_dir"
model_path="$root/models/$local_model_file"
if [[ ! -f "$model_path" ]] || ! printf '%s  %s\n' "$local_model_sha256" "$model_path" | sha256sum --check --status; then
  rm -f "$model_path.part"
  curl --fail --location --retry 5 --retry-delay 3 --output "$model_path.part" "$local_model_url"
  printf '%s  %s\n' "$local_model_sha256" "$model_path.part" | sha256sum --check --status
  mv "$model_path.part" "$model_path"
fi
chmod 644 "$model_path"
embedding_model_path="$root/models/$embedding_model_file"
if [[ ! -f "$embedding_model_path" ]] || ! printf '%s  %s\n' "$embedding_model_sha256" "$embedding_model_path" | sha256sum --check --status; then
  rm -f "$embedding_model_path.part"
  curl --fail --location --retry 5 --retry-delay 3 --output "$embedding_model_path.part" "$embedding_model_url"
  printf '%s  %s\n' "$embedding_model_sha256" "$embedding_model_path.part" | sha256sum --check --status
  mv "$embedding_model_path.part" "$embedding_model_path"
fi
chmod 644 "$embedding_model_path"
docker rm -f nca-grc-test-local-ai nca-grc-test-local-embeddings >/dev/null 2>&1 || true
docker compose up -d local-ai local-embeddings
docker compose build api
docker compose run --rm api npm run migrate
# The live containers use stable names across release directories. Replace only
# the stateless API/web pair after the model, build and migration have passed.
docker rm -f nca-grc-test-web nca-grc-test-api >/dev/null 2>&1 || true
docker compose up -d

for attempt in $(seq 1 40); do
  if curl --silent --show-error --insecure --resolve dev-env.corp.nca.org.gh:3054:127.0.0.1 "$application_url/api/health" | grep -q '"success":true'; then
    break
  fi
  if [[ "$attempt" == "40" ]]; then
    docker compose ps
    docker compose logs --tail=100 api web
    echo "Deployment health check failed." >&2
    exit 1
  fi
  sleep 2
done

# The shared test Mailpit instance is a capture sink and does not advertise
# STARTTLS. Keep application SMTP policy intact and verify database/runtime
# readiness here; production SMTP must be verified separately before go-live.
docker compose exec -T api npm run readiness -- --skip-email
docker compose exec -T api npm run verify:local-ai
embedding_probe="$(docker compose exec -T api node -e '
  (async () => {
    const response = await fetch("http://127.0.0.1:8081/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "all-MiniLM-L6-v2-Q4_K_M", input: "semantic readiness" })
    });
    if (!response.ok) throw new Error(`Embedding endpoint returned HTTP ${response.status}.`);
    const payload = await response.json();
    const vector = payload?.data?.[0]?.embedding;
    if (!Array.isArray(vector) || !vector.length) throw new Error("Embedding response contained no vector.");
    console.log(JSON.stringify({ ready: true, dimensions: vector.length, model: payload.model || null }));
  })().catch(error => { console.error(error.message); process.exit(1); });
')"
if ! grep -q '"ready":true' <<<"$embedding_probe"; then
  echo "Local semantic embeddings verification failed." >&2
  exit 1
fi
echo "$embedding_probe"
ln -sfn "$release_dir" "$root/current"
printf '%s\n' "$release_id" > "$root/CURRENT_RELEASE"
chmod 600 "$root/CURRENT_RELEASE"

docker compose ps
echo "DEPLOYMENT_OK $application_url"
