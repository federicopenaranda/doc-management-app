import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../auth/auth.model.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { DocumentSummary } from './document.model.js';
import { DocumentsListService } from './documents-list.service.js';

const idSchema = z.uuid();

/** Any logged-in user sees the documents of their own client (viewers too). */
@ApiExcludeController()
@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsListController {
  constructor(private readonly documents: DocumentsListService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest): Promise<DocumentSummary[]> {
    return this.documents.list(request.user.id);
  }

  @Get(':id/view-url')
  async viewUrl(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<{ url: string }> {
    // Something that is not an id cannot be a document: 404, not a database error.
    if (!idSchema.safeParse(id).success) {
      throw new NotFoundException('Document not found');
    }
    return this.documents.viewUrl(request.user.id, id);
  }
}
