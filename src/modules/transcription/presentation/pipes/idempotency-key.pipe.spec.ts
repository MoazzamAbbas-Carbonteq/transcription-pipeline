import { BadRequestException } from '@nestjs/common';
import { IdempotencyKeyPipe } from './idempotency-key.pipe';

describe('IdempotencyKeyPipe', () => {
  const pipe = new IdempotencyKeyPipe();

  it('accepts a UUID v4', () => {
    expect(pipe.transform('550e8400-e29b-41d4-a716-446655440000')).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    );
  });

  it('rejects missing values', () => {
    expect(() => pipe.transform(undefined)).toThrow(BadRequestException);
    expect(() => pipe.transform('')).toThrow(BadRequestException);
  });

  it('rejects non-UUID values', () => {
    expect(() => pipe.transform('not-a-uuid')).toThrow(BadRequestException);
  });
});
