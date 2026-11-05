import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { z } from 'zod';
import type { Env } from '../config/env.validation.js';
import { DocumentsService } from './documents.service.js';
import { PubsubOidcGuard } from './pubsub-oidc.guard.js';

const pushBody = z.object({ message: z.object({ data: z.string() }) });
const gcsEvent = z.object({
  bucket: z.string().min(1),
  name: z.string().min(1),
  generation: z.coerce.string(),
  contentType: z.string().optional(),
});

@ApiExcludeController()
@Controller('pubsub')
export class DocumentsController {
  private readonly logger = new Logger(DocumentsController.name);

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly documents: DocumentsService,
  ) {}

  /** Pub/Sub push endpoint. 200 acknowledges; an error makes Pub/Sub retry, then dead-letter. */
  @Post('documents')
  @HttpCode(200)
  @UseGuards(PubsubOidcGuard)
  async receive(@Body() body: unknown): Promise<void> {
    if (!this.config.get('DOCUMENT_PROCESSING_ENABLED', { infer: true }))
      return;

    const event = this.decode(body);
    if (!event) return;
    if (
      event.name.endsWith('/') ||
      event.bucket === this.config.get('PROCESSED_BUCKET', { infer: true })
    ) {
      return;
    }
    await this.documents.process(event);
  }

  /** Retrying a malformed message cannot fix it, so it is logged and acknowledged. */
  private decode(body: unknown) {
    try {
      const push = pushBody.parse(body);
      const json: unknown = JSON.parse(
        Buffer.from(push.message.data, 'base64').toString('utf8'),
      );
      return gcsEvent.parse(json);
    } catch {
      this.logger.warn('Skipping a malformed Pub/Sub message');
      return undefined;
    }
  }
}
