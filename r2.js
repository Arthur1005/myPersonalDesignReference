/* ------------------------------------------------------------------ *
 *  Upload big videos straight from the browser to a Cloudflare R2 bucket.
 *  R2 speaks the S3 protocol, so this signs a one-hour upload link
 *  (AWS Signature V4, query-string form) with keys kept in the owner's
 *  browser, then sends the file to it.
 * ------------------------------------------------------------------ */
import { R2_ACCOUNT_ID, R2_BUCKET, R2_PUBLIC_URL } from './config.js';

export const R2_BASE = (R2_PUBLIC_URL || '').replace(/\/+$/, '');
export const R2_ON = !!(R2_ACCOUNT_ID && R2_BUCKET && R2_BASE);
export const isR2 = (path) => R2_ON && path.startsWith(R2_BASE + '/');

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(msg));
}
// RFC 3986 encoding, as the signature rules require
const rfc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

/** A signed link that allows one request (e.g. PUT) to host+path for `expires` seconds. */
export async function presign({ method, host, path, accessKeyId, secretAccessKey, region = 'auto', expires = 3600, now = new Date() }) {
  const amzDate = now.toISOString().replace(/[-:]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${region}/s3/aws4_request`;
  const uri = path.split('/').map(rfc).join('/');
  const query = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expires)],
    ['X-Amz-SignedHeaders', 'host'],
  ].map(([k, v]) => `${rfc(k)}=${rfc(v)}`).sort().join('&');
  const canonical = [method, uri, query, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256(canonical)].join('\n');
  let key = await hmac('AWS4' + secretAccessKey, day);
  for (const part of [region, 's3', 'aws4_request']) key = await hmac(key, part);
  return `https://${host}${uri}?${query}&X-Amz-Signature=${hex(await hmac(key, toSign))}`;
}

export class R2AuthError extends Error {}

/** Send a file to the bucket. `publicUrl` is where it will be reachable afterwards. */
export async function r2Upload(publicUrl, blob, creds, onProgress) {
  const key = decodeURIComponent(publicUrl.slice(R2_BASE.length + 1));
  const url = await presign({
    method: 'PUT',
    host: `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    path: `/${R2_BUCKET}/${key}`,
    ...creds,
  });
  await new Promise((res, rej) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.setRequestHeader('Content-Type', blob.type || 'application/octet-stream');
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    x.onload = () => {
      if (x.status >= 200 && x.status < 300) res();
      else if (x.status === 401 || x.status === 403) rej(new R2AuthError('the upload keys were rejected'));
      else rej(new Error(`the video store said ${x.status}`));
    };
    x.onerror = () => rej(new Error('the upload was blocked. Check the bucket\'s CORS setting (see README) and your connection.'));
    x.send(blob);
  });
}
