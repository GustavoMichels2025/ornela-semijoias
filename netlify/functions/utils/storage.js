const { S3Client } = require('@aws-sdk/client-s3');

function firstValue(...values) {
  return values.find(value => String(value || '').trim())?.trim() || '';
}

function getStorageConfig() {
  const config = {
    bucket: firstValue(
      process.env.NEON_STORAGE_BUCKET,
      process.env.AWS_S3_BUCKET,
      process.env.S3_BUCKET,
      'ornela-produtos'
    ),
    endpoint: firstValue(
      process.env.NEON_STORAGE_ENDPOINT,
      process.env.AWS_ENDPOINT_URL_S3
    ),
    region: firstValue(
      process.env.NEON_STORAGE_REGION,
      process.env.AWS_REGION,
      'us-east-2'
    ),
    accessKeyId: firstValue(
      process.env.NEON_STORAGE_ACCESS_KEY_ID,
      process.env.AWS_ACCESS_KEY_ID
    ),
    secretAccessKey: firstValue(
      process.env.NEON_STORAGE_SECRET_ACCESS_KEY,
      process.env.AWS_SECRET_ACCESS_KEY
    )
  };

  const missing = [];
  if (!config.endpoint) missing.push('AWS_ENDPOINT_URL_S3');
  if (!config.accessKeyId) missing.push('AWS_ACCESS_KEY_ID');
  if (!config.secretAccessKey) missing.push('AWS_SECRET_ACCESS_KEY');

  if (missing.length) {
    throw new Error(`Configure no Netlify as variáveis do Neon Storage: ${missing.join(', ')}.`);
  }

  return config;
}

function getStorageClient() {
  const config = getStorageConfig();
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });

  return { client, config };
}

module.exports = { getStorageConfig, getStorageClient };
