import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { AuthIfEnabledGuard } from '../auth/auth-if-enabled.guard.js';
import { signRequestSchema } from './uploads.schema.js';
import { UploadsService, type SignedUpload } from './uploads.service.js';

@ApiExcludeController()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('sign')
  @UseGuards(AuthIfEnabledGuard)
  @HttpCode(200)
  async sign(@Body() body: unknown): Promise<{ uploads: SignedUpload[] }> {
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
