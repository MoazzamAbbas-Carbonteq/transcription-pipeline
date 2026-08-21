import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Response } from 'express';
import {
  AppError,
  InvalidMediaError,
  NotFoundAppError,
  UnsupportedMediaError,
  ValidationAppError,
} from '../errors/app.errors';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : ((exceptionResponse as { message?: string | string[] }).message ??
            exception.message);

      response.status(status).json({
        statusCode: status,
        error: this.statusName(status),
        message,
      });
      return;
    }

    if (exception instanceof PayloadTooLargeException) {
      response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        error: 'Payload Too Large',
        message: 'Uploaded file exceeds the configured maximum size',
      });
      return;
    }

    if (exception instanceof NotFoundAppError) {
      response.status(HttpStatus.NOT_FOUND).json({
        statusCode: HttpStatus.NOT_FOUND,
        error: 'Not Found',
        message: exception.message,
      });
      return;
    }

    if (exception instanceof UnsupportedMediaError) {
      response.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE).json({
        statusCode: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        error: 'Unsupported Media Type',
        message: exception.message,
      });
      return;
    }

    if (exception instanceof InvalidMediaError) {
      response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'Unprocessable Entity',
        message: exception.message,
      });
      return;
    }

    if (exception instanceof ValidationAppError) {
      const status =
        exception.code === 'FILE_TOO_LARGE'
          ? HttpStatus.PAYLOAD_TOO_LARGE
          : HttpStatus.BAD_REQUEST;
      response.status(status).json({
        statusCode: status,
        error: this.statusName(status),
        message: exception.message,
      });
      return;
    }

    if (exception instanceof AppError) {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: exception.message,
      });
      return;
    }

    // Multer file-size errors surface as plain errors with a code.
    if (
      typeof exception === 'object' &&
      exception !== null &&
      'code' in exception &&
      (exception as { code?: string }).code === 'LIMIT_FILE_SIZE'
    ) {
      response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        error: 'Payload Too Large',
        message: 'Uploaded file exceeds the configured maximum size',
      });
      return;
    }

    this.logger.error({
      message: 'Unhandled exception',
      error: exception instanceof Error ? exception.message : 'Unknown error',
    });

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  }

  private statusName(status: number): string {
    const names: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'Bad Request',
      [HttpStatus.NOT_FOUND]: 'Not Found',
      [HttpStatus.PAYLOAD_TOO_LARGE]: 'Payload Too Large',
      [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'Unsupported Media Type',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'Unprocessable Entity',
    };
    return names[status] ?? 'Error';
  }
}
