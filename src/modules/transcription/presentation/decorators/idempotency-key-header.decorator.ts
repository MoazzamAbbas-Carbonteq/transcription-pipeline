import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/**
 * Reads the Idempotency-Key header. Validation is applied via IdempotencyKeyPipe.
 */
export const IdempotencyKeyHeader = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): unknown => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.headers['idempotency-key'];
  },
);
