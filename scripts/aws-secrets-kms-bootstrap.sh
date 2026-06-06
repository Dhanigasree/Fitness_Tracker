#!/usr/bin/env bash
set -euo pipefail

: "${AWS_REGION:=us-east-1}"
: "${SECRET_NAME:=fitness-tracker/production/runtime}"
: "${KMS_ALIAS:=alias/fitness-tracker-secrets}"
: "${MONGODB_URI:?Set MONGODB_URI before running this script}"
: "${DD_API_KEY:?Set DD_API_KEY before running this script}"

key_id="$(
  aws kms describe-key \
    --region "${AWS_REGION}" \
    --key-id "${KMS_ALIAS}" \
    --query 'KeyMetadata.KeyId' \
    --output text 2>/dev/null || true
)"

if [[ -z "${key_id}" || "${key_id}" == "None" ]]; then
  key_id="$(
    aws kms create-key \
      --region "${AWS_REGION}" \
      --description "Fitness Tracker runtime secrets" \
      --key-usage ENCRYPT_DECRYPT \
      --origin AWS_KMS \
      --query 'KeyMetadata.KeyId' \
      --output text
  )"

  aws kms create-alias \
    --region "${AWS_REGION}" \
    --alias-name "${KMS_ALIAS}" \
    --target-key-id "${key_id}"

  aws kms enable-key-rotation \
    --region "${AWS_REGION}" \
    --key-id "${key_id}"
fi

secret_payload="$(
  jq -n \
    --arg mongodbUri "${MONGODB_URI}" \
    --arg datadogApiKey "${DD_API_KEY}" \
    '{MONGODB_URI: $mongodbUri, DD_API_KEY: $datadogApiKey}'
)"

if aws secretsmanager describe-secret --region "${AWS_REGION}" --secret-id "${SECRET_NAME}" >/dev/null 2>&1; then
  aws secretsmanager put-secret-value \
    --region "${AWS_REGION}" \
    --secret-id "${SECRET_NAME}" \
    --secret-string "${secret_payload}" >/dev/null
else
  aws secretsmanager create-secret \
    --region "${AWS_REGION}" \
    --name "${SECRET_NAME}" \
    --kms-key-id "${KMS_ALIAS}" \
    --secret-string "${secret_payload}" >/dev/null
fi

echo "Secret ${SECRET_NAME} is stored in AWS Secrets Manager with KMS key ${KMS_ALIAS}."
