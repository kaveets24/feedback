import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import type { ErrorResponse } from '@demo/shared';

function body(code: string, message: string, details?: unknown): ErrorResponse {
  return { error: { code, message, ...(details !== undefined && { details }) } };
}

/** Maps every error to the `{ error: { code, message, details? } }` shape. */
export function registerErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler((_request, reply) => {
    void reply.status(404).send(body('NOT_FOUND', 'Not found'));
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply
        .status(400)
        .send(body('VALIDATION_ERROR', 'Request validation failed', error.validation));
    }

    const status = error.statusCode ?? 500;
    if (status >= 500) {
      request.log.error({ err: error }, 'unhandled error');
      return reply.status(status).send(body('INTERNAL_ERROR', 'Something went wrong'));
    }
    return reply.status(status).send(body(error.code ?? 'BAD_REQUEST', error.message));
  });
}

/** An error the error handler turns into `{ error: { code, message } }` with this status. */
export function httpError(statusCode: number, code: string, message: string): Error {
  return Object.assign(new Error(message), { statusCode, code });
}
