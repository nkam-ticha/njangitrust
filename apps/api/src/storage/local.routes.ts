// PUT and GET /v1/storage/local/<key>?op&exp&ct&max&sig: the local driver's signed URLs (D2).
// Uploads stream to a temporary file with a hard size limit and never overwrite an object;
// downloads are served with the type detected from the bytes and `nosniff`.
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { Router, type Request } from 'express';
import { commonError } from '../lib/errors';
import { detectFileType, SNIFF_BYTES } from './file-type';
import type { LocalStorage, SignedRequest } from './local-driver';
import { isValidStorageKey } from './storage.types';

function signedRequest(req: Request, op: 'put' | 'get'): { request: SignedRequest; sig: string } {
  const segments = (req.params as { key?: string[] | string }).key;
  const key = Array.isArray(segments) ? segments.join('/') : (segments ?? '');
  const q = req.query as Record<string, unknown>;
  const text = (name: string) => (typeof q[name] === 'string' ? q[name] : '');
  if (!isValidStorageKey(key) || text('op') !== op) throw commonError('NOT_FOUND');
  return {
    request: { op, key, exp: Number(text('exp')), contentType: text('ct'), maxBytes: Number(text('max')) },
    sig: text('sig'),
  };
}

function sizeLimit(maxBytes: number): Transform {
  let seen = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      seen += chunk.length;
      if (seen > maxBytes) callback(commonError('PAYLOAD_TOO_LARGE'));
      else callback(null, chunk);
    },
  });
}

export function localStorageRoutes(storage: LocalStorage): Router {
  const router = Router();

  router.put('/*key', async (req, res) => {
    const { request, sig } = signedRequest(req, 'put');
    if (!storage.verify(request, sig)) throw commonError('FORBIDDEN');
    if ((req.get('content-type') ?? '') !== request.contentType) throw commonError('UNSUPPORTED_MEDIA_TYPE');
    const declared = Number(req.get('content-length') ?? '0');
    if (declared > request.maxBytes) throw commonError('PAYLOAD_TOO_LARGE');
    const target = storage.pathOf(request.key);
    if (await stat(target).then(() => true, () => false)) throw commonError('CONFLICT');
    await mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${randomUUID()}.part`;
    try {
      await pipeline(req, sizeLimit(request.maxBytes), createWriteStream(temp, { flags: 'wx' }));
      await rename(temp, target);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
    res.status(204).end();
  });

  router.get('/*key', async (req, res) => {
    const { request, sig } = signedRequest(req, 'get');
    if (!storage.verify(request, sig)) throw commonError('FORBIDDEN');
    const head = await storage.readHead(request.key, SNIFF_BYTES);
    if (!head) throw commonError('NOT_FOUND');
    res.setHeader('Content-Type', detectFileType(head) ?? 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=300');
    await pipeline(createReadStream(storage.pathOf(request.key)), res);
  });

  return router;
}
