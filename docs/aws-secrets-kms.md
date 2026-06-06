# AWS Secrets Manager and KMS

This repo is wired for EKS using AWS Secrets Manager, AWS KMS, and External Secrets Operator.

## Runtime Secret

Store runtime-only values in one JSON secret:

```json
{
  "MONGODB_URI": "mongodb://mongodb-service:27017/fitness-tracker",
  "DD_API_KEY": "replace-with-real-value"
}
```

Default secret name:

```text
fitness-tracker/production/runtime
```

The helper script creates or updates that secret and encrypts it with a customer-managed KMS key:

```bash
export AWS_REGION=us-east-1
export SECRET_NAME=fitness-tracker/production/runtime
export KMS_ALIAS=alias/fitness-tracker-secrets
export MONGODB_URI='mongodb://mongodb-service:27017/fitness-tracker'
export DD_API_KEY='...'

bash scripts/aws-secrets-kms-bootstrap.sh
```

## EKS Access

External Secrets Operator reads from AWS Secrets Manager through IRSA. Create an IAM role for the service account in `helm/values.yaml` and allow only:

```json
{
  "Action": [
    "secretsmanager:GetSecretValue",
    "secretsmanager:DescribeSecret",
    "kms:Decrypt"
  ],
  "Resource": [
    "arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:fitness-tracker/production/runtime-*",
    "arn:aws:kms:us-east-1:ACCOUNT_ID:key/KMS_KEY_ID"
  ],
  "Effect": "Allow"
}
```

Then set:

```yaml
aws:
  roleArn: arn:aws:iam::ACCOUNT_ID:role/fitness-tracker-external-secrets
```

## Deploy

Install External Secrets Operator once per cluster:

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm upgrade --install external-secrets external-secrets/external-secrets \
  --namespace external-secrets \
  --create-namespace
```

Deploy this app chart:

```bash
helm upgrade --install fitness-tracker ./helm \
  --namespace fitness-ns \
  --create-namespace \
  --set image.tag="$BUILD_NUMBER" \
  --set aws.region="us-east-1" \
  --set aws.roleArn="arn:aws:iam::ACCOUNT_ID:role/fitness-tracker-external-secrets"
```

Kubernetes will receive a generated Secret named `fitness-tracker-runtime-secrets`; do not commit static Kubernetes Secret manifests.
