// Input validation (spec 2.7): every body, path parameter and query string goes through a zod
// schema before the handler runs. Request schemas are strict, and a route that declares no body
// or query refuses one. Errors list field paths and stable codes, never the values sent.
import type { Request, RequestHandler, Response } from 'express';
import type { z } from 'zod';
import type { FieldIssue } from '@njangi/shared/contracts/common';
import { commonError } from '../lib/errors';

type AnySchema = z.ZodType;

export interface Schemas {
  body?: AnySchema;
  params?: AnySchema;
  query?: AnySchema;
}

type Parsed<S> = S extends AnySchema ? z.output<S> : undefined;

export interface Input<S extends Schemas> {
  body: Parsed<S['body']>;
  params: Parsed<S['params']>;
  query: Parsed<S['query']>;
}

const STABLE_CODE = /^[A-Z][A-Z0-9_]+$/;

function toFieldIssues(error: z.ZodError, where: string): FieldIssue[] {
  return error.issues.slice(0, 20).flatMap((issue) => {
    const path = [where, ...issue.path.map(String)].join('.');
    if (issue.code === 'unrecognized_keys') {
      const keys = (issue as { keys?: string[] }).keys ?? [];
      return keys.map((key) => ({ path: `${path}.${key}`, code: 'UNKNOWN_FIELD' }));
    }
    return [{ path, code: STABLE_CODE.test(issue.message) ? issue.message : issue.code.toUpperCase() }];
  });
}

function parse(schema: AnySchema, value: unknown, where: string): unknown {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw commonError('VALIDATION_FAILED', { details: { issues: toFieldIssues(result.error, where) } });
  }
  return result.data;
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  return typeof value === 'object' && Object.keys(value as object).length === 0;
}

function refuseUnexpected(value: unknown, where: string): void {
  if (!isEmpty(value)) {
    throw commonError('VALIDATION_FAILED', { details: { issues: [{ path: where, code: 'UNEXPECTED' }] } });
  }
}

/**
 * Wraps a route handler: validates the input, then calls `fn` with the parsed values. Express 5
 * forwards a rejected promise to the error handler.
 */
export function handle<S extends Schemas>(
  schemas: S,
  fn: (input: Input<S>, req: Request, res: Response) => Promise<void> | void,
): RequestHandler {
  return async (req, res) => {
    const body = req.body as unknown;
    if (!schemas.body) refuseUnexpected(body, 'body');
    if (!schemas.query) refuseUnexpected(req.query, 'query');
    const input = {
      body: schemas.body ? parse(schemas.body, body ?? {}, 'body') : undefined,
      params: schemas.params ? parse(schemas.params, req.params, 'params') : undefined,
      query: schemas.query ? parse(schemas.query, req.query, 'query') : undefined,
    } as Input<S>;
    await fn(input, req, res);
  };
}
