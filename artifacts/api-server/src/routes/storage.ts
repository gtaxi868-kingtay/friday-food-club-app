import { Readable } from 'stream';
import {
  RequestImageUploadBody,
  RequestImageUploadResponse,
} from '@workspace/api-zod';
import { Router, type IRouter, type Request, type Response } from 'express';

import {
  ObjectNotFoundError,
  ObjectStorageService,
} from '../lib/objectStorage';
import { getSession } from './auth';
import { runRead } from '../lib/neo4j';

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

function hasAuthenticatedSession(
  req: Request,
): req is Request & { isAuthenticated: () => boolean } {
  if (
    !('isAuthenticated' in req) ||
    typeof req.isAuthenticated !== 'function'
  ) {
    return false;
  }

  return req.isAuthenticated();
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 * Requires auth middleware so public callers cannot mint write-capable URLs.
 */
router.post(
  '/storage/uploads/request-url',
  async (req: Request, res: Response) => {
    if (!hasAuthenticatedSession(req)) {
      res.status(401).json({ error: 'Unauthorized' });

      return;
    }

    const parsed = RequestImageUploadBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Missing or invalid required fields' });
      return;
    }

    try {
      const { name, size, contentType } = parsed.data;

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath =
        objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json(
        RequestImageUploadResponse.parse({
          uploadURL,
          objectPath,
          metadata: { name, size, contentType },
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, 'Error generating upload URL');
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get(
  '/storage/public-objects/*filePath',
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join('/') : raw;
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      const response = await objectStorageService.downloadObject(file);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      req.log.error({ err: error }, 'Error serving public object');
      res.status(500).json({ error: 'Failed to serve public object' });
    }
  },
);

/**
 * GET /storage/objects/*
 *
 * Serve private object entities (food badge photos, national IDs).
 * Access is restricted: only the uploading user or ADMIN role may read.
 */
router.get('/storage/objects/*path', async (req: Request, res: Response) => {
  // ── Auth check ────────────────────────────────────────────────────────────
  const token = (req as any).cookies?.['ffc_session'] ?? req.headers.authorization?.replace(/^Bearer /, '');
  const session = getSession({ cookies: { ffc_session: token }, headers: req.headers } as any);
  if (!session) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join('/') : raw;
    const objectPath = `/objects/${wildcardPath}`;

    // ── Ownership / admin check ───────────────────────────────────────────
    if (session.role !== 'ADMIN') {
      const rows = await runRead<{ owned: boolean }>(
        `MATCH (u:User {id: $userId})-[:OWNS_UPLOAD]->(up:Upload {objectPath: $objectPath})
         RETURN count(up) > 0 AS owned`,
        { userId: session.userId, objectPath }
      );
      const owned = rows[0]?.owned === true;
      if (!owned) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }

    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(objectFile);

    // ── Safe serving headers ─────────────────────────────────────────────────
    // Prevent uploaded content from rendering or executing in-browser.
    // We whitelist safe image MIME types; anything else becomes octet-stream.
    const SAFE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    const rawContentType = response.headers.get('Content-Type') ?? '';
    const safeContentType = SAFE_IMAGE_TYPES.has(rawContentType) ? rawContentType : 'application/octet-stream';

    res.status(response.status);
    // Only forward safe headers; never propagate stored Content-Type verbatim
    const allowedHeaders = ['Content-Length', 'Cache-Control', 'ETag', 'Last-Modified'];
    response.headers.forEach((value, key) => {
      if (allowedHeaders.includes(key)) res.setHeader(key, value);
    });
    res.setHeader('Content-Type', safeContentType);
    res.setHeader('Content-Disposition', 'attachment; filename="document"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");

    if (response.body) {
      const nodeStream = Readable.fromWeb(
        response.body as ReadableStream<Uint8Array>,
      );
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, 'Object not found');
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    req.log.error({ err: error }, 'Error serving object');
    res.status(500).json({ error: 'Failed to serve object' });
  }
});

export default router;
