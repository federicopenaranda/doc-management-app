import { SkipEnvelope } from '../common/api-response.js';
import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { z } from 'zod';
import { processedKey } from './document-key.js';
import { DocumentsService } from './documents.service.js';
import { PubsubOidcGuard } from './pubsub-oidc.guard.js';

const pushBody = z.object({ message: z.object({ data: z.string() }) });
const gcsEvent = z.object({
  bucket: z.string().min(1),
  name: z.string().min(1),
  generation: z.coerce.string(),
  contentType: z.string().optional(),
  // Cloud Storage sends numbers as strings.
  size: z.coerce.number().int().nonnegative(),
  metadata: z.record(z.string(), z.string()).optional(),
});

@ApiExcludeController()
@Controller('pubsub')
// Pub/Sub reads only the status code of its push.
@SkipEnvelope()
export class DocumentsController {
  private readonly logger = new Logger(DocumentsController.name);

  constructor(private readonly documents: DocumentsService) {}

  /** Pub/Sub push endpoint. 200 acknowledges; an error makes Pub/Sub retry, then dead-letter. */
  @Post('documents')
  @HttpCode(200)
  @UseGuards(PubsubOidcGuard)
  async receive(@Body() body: unknown): Promise<void> {
    const event = this.decode(body);
    if (!event) return;
    // Only originals/<client>/<doc>/<file> is work for the worker; the notification already filters on originals/, this
    // keeps anything else (and the worker's own output) from being processed.
    if (processedKey(event.name) === undefined) return;
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
