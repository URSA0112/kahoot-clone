#!/usr/bin/env bash
# Deploys QUIZ to Cloud Run in the current gcloud project.
set -euo pipefail
P=$(gcloud config get-value project 2>/dev/null)
REGION=us-central1
NUM=$(gcloud projects describe "$P" --format='value(projectNumber)')
SA="$NUM-compute@developer.gserviceaccount.com"

echo ">> Project $P"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com aiplatform.googleapis.com -q

echo ">> Granting roles to $SA"
for R in roles/cloudbuild.builds.builder roles/aiplatform.user roles/run.admin \
         roles/iam.serviceAccountUser roles/artifactregistry.writer roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$P" --member="serviceAccount:$SA" \
    --role="$R" --condition=None -q >/dev/null
done

echo ">> Deploying (takes ~5 min)"
gcloud run deploy quiz --source . --region "$REGION" -q \
  --allow-unauthenticated --session-affinity \
  --min-instances 0 --max-instances 1 --timeout 3600 --memory 512Mi \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$P,GOOGLE_CLOUD_LOCATION=$REGION"

URL=$(gcloud run services describe quiz --region "$REGION" --format='value(status.url)')
echo ""
echo "=============================="
echo " QUIZ URL: $URL"
echo "=============================="
