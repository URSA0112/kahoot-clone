#!/usr/bin/env bash
# Deploys QUIZ to Cloud Run in the current gcloud project (run from Cloud Shell).
set -euo pipefail
P=$(gcloud config get-value project 2>/dev/null)
REGION=us-central1
NUM=$(gcloud projects describe "$P" --format='value(projectNumber)')
SA="$NUM-compute@developer.gserviceaccount.com"

echo ">> Project $P"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com aiplatform.googleapis.com firestore.googleapis.com -q

echo ">> Granting roles to $SA"
for R in roles/cloudbuild.builds.builder roles/aiplatform.user roles/run.admin \
         roles/iam.serviceAccountUser roles/artifactregistry.writer roles/logging.logWriter \
         roles/datastore.user; do
  gcloud projects add-iam-policy-binding "$P" --member="serviceAccount:$SA" \
    --role="$R" --condition=None -q >/dev/null
done

echo ">> Firestore (stores game sessions + answers for the teacher dashboard)"
gcloud firestore databases describe --database='(default)' >/dev/null 2>&1 || \
  gcloud firestore databases create --location="$REGION" --type=firestore-native -q

# Admin password: $ADMIN_PASSWORD, or the one saved earlier, or a new random one.
PWFILE="$HOME/.quiz_admin_password"
if [ -z "${ADMIN_PASSWORD:-}" ]; then
  [ -f "$PWFILE" ] || (openssl rand -base64 12 | tr -dc 'A-Za-z0-9' | head -c 12 > "$PWFILE")
  ADMIN_PASSWORD=$(cat "$PWFILE")
fi
SECFILE="$HOME/.quiz_admin_secret"
[ -f "$SECFILE" ] || openssl rand -hex 32 > "$SECFILE"

echo ">> Deploying (takes ~5 min)"
gcloud run deploy quiz --source . --region "$REGION" -q \
  --allow-unauthenticated --session-affinity \
  --min-instances 0 --max-instances 1 --timeout 3600 --memory 512Mi \
  --set-env-vars "NODE_ENV=production,STORE=firestore,GOOGLE_CLOUD_PROJECT=$P,GOOGLE_CLOUD_LOCATION=global,GEMINI_MODEL=gemini-3.5-flash,ADMIN_PASSWORD=$ADMIN_PASSWORD,ADMIN_SECRET=$(cat "$SECFILE")"

URL=$(gcloud run services describe quiz --region "$REGION" --format='value(status.url)')
echo ""
echo "=============================="
echo " QUIZ URL:  $URL"
echo " Багшийн самбар: $URL/admin"
echo " Нууц үг:   $ADMIN_PASSWORD"
echo "=============================="
