import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { parseBody } from '../common/validation.js';
import type { AuthenticatedRequest } from '../auth/auth.model.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { signRequestSchema } from './uploads.schema.js';
import { UploadsService } from './uploads.service.js';
import type { SignedUpload } from './upload.model.js';

@ApiExcludeController()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('sign')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async sign(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<{ uploads: SignedUpload[] }> {
    const parsed = parseBody(signRequestSchema, body);
    return {
      uploads: await this.uploads.sign(request.user.id, parsed.files),
    };
  }
}
