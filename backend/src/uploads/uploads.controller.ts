import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { parseBody } from '../common/validation.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { signRequestSchema } from './uploads.schema.js';
import { UploadsService, type SignedUpload } from './uploads.service.js';

@ApiExcludeController()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('sign')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async sign(@Body() body: unknown): Promise<{ uploads: SignedUpload[] }> {
    const parsed = parseBody(signRequestSchema, body);
    return { uploads: await this.uploads.sign(parsed.files) };
  }
}
