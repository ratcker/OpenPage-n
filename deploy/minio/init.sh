#!/bin/sh

set -eu

POLICY_NAME="openpage-backend"

mc alias set local \
    "$S3_ENDPOINT_URL" \
    "$MINIO_ROOT_USER" \
    "$MINIO_ROOT_PASSWORD"

mc mb --ignore-existing "local/$S3_BUCKET_NAME"

cat > /tmp/openpage-backend-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetBucketLocation",
        "s3:ListBucket",
        "s3:ListBucketMultipartUploads"
      ],
      "Resource": [
        "arn:aws:s3:::$S3_BUCKET_NAME"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": [
        "arn:aws:s3:::$S3_BUCKET_NAME/*"
      ]
    }
  ]
}
EOF

mc admin policy create \
    local \
    "$POLICY_NAME" \
    /tmp/openpage-backend-policy.json

mc admin user add \
    local \
    "$S3_ACCESS_KEY_ID" \
    "$S3_SECRET_ACCESS_KEY"

mc admin policy attach \
    local \
    "$POLICY_NAME" \
    --user "$S3_ACCESS_KEY_ID"