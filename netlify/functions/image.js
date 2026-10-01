const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { json, methodNotAllowed } = require('./utils/response');
const { getStorageClient } = require('./utils/storage');

async function bodyToBuffer(body) {
  if (!body) return Buffer.alloc(0);

  if (typeof body.transformToByteArray === 'function') {
    return Buffer.from(await body.transformToByteArray());
  }

  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function isSafeObjectKey(key) {
  return Boolean(key) && key.length <= 500 && !key.includes('..') && !key.includes('\\') && !key.includes('\0');
}

exports.handler = async event => {
  if (event.httpMethod !== 'GET') return methodNotAllowed();

  const key = String(event.queryStringParameters?.key || '').trim();
  if (!isSafeObjectKey(key)) return json(400, { error: 'Identificador de imagem inválido.' });

  try {
    const { client, config } = getStorageClient();
    const object = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
    const buffer = await bodyToBuffer(object.Body);

    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        'Content-Type': object.ContentType || 'image/jpeg',
        'Content-Length': String(buffer.length),
        'Cache-Control': object.CacheControl || 'public, max-age=31536000, immutable',
        'Netlify-CDN-Cache-Control': 'public, durable, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff'
      },
      body: buffer.toString('base64')
    };
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode === 404 || error?.name === 'NoSuchKey' ? 404 : 500;
    return json(status, { error: status === 404 ? 'Imagem não encontrada.' : 'Não foi possível carregar a imagem.' });
  }
};
