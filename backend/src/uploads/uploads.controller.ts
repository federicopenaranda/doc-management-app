import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Env } from '../config/env.validation.js';
import { signRequestSchema } from './uploads.schema.js';
import { UploadsService, type SignedUpload } from './uploads.service.js';

@ApiExcludeController()
@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly uploads: UploadsService,
  ) {}

  @Post('sign')
  @HttpCode(200)
  async sign(@Body() body: unknown): Promise<{ uploads: SignedUpload[] }> {
    // A disabled feature does not exist as far as clients can tell.
    if (!this.config.get('UPLOADS_ENABLED', { infer: true })) {
      throw new NotFoundException();
    }
    const parsed = signRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; '),
      );
    }
    return { uploads: await this.uploads.sign(parsed.data.files) };
  }
}
