// Turns every error into `{ code, messageFr, messageEn, details? }` (spec 2.7). Unknown errors
// become INTERNAL: the stack trace and message are logged (redacted), never sent.
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '../lib/prisma';
import { AppError, commonError } from '../lib/errors';
import { componentLogger } from '../lib/logger';

const log = componentLogger('errors');

interface BodyParserError {
  type?: string;
  status?: number;
  expose?: boolean;
}

function fromBodyParser(error: BodyParserError): AppError | null {
  switch (error.type) {
    case 'entity.parse.failed':
      return commonError('INVALID_JSON');
    case 'entity.too.large':
      return commonError('PAYLOAD_TOO_LARGE');
    case 'charset.unsupported':
    case 'encoding.unsupported':
      return commonError('UNSUPPORTED_MEDIA_TYPE');
    default:
      return typeof error.status === 'number' && error.status >= 400 && error.status < 500
        ? commonError('VALIDATION_FAILED')
        : null;
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Unique violations and write conflicts: a concurrent request got there first.
    if (error.code === 'P2002' || error.code === 'P2034') return commonError('CONFLICT');
    if (error.code === 'P2025') return commonError('NOT_FOUND');
  }
  if (error && typeof error === 'object' && 'type' in error) {
    const mapped = fromBodyParser(error as BodyParserError);
    if (mapped) return mapped;
  }
  return commonError('INTERNAL');
}

export function errorHandler(): ErrorRequestHandler {
  return (error: unknown, _req, res, _next) => {
    const appError = toAppError(error);
    if (appError.status >= 500) log.error({ err: error, code: appError.code }, 'unhandled error');
    else log.debug({ code: appError.code, status: appError.status }, 'request refused');
    if (res.headersSent) return;
    res.status(appError.status).json(appError.toBody());
  };
}

export function notFound(): RequestHandler {
  return (_req, _res, next) => next(commonError('ROUTE_NOT_FOUND'));
}
