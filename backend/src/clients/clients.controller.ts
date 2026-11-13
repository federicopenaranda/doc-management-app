import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { parseBody } from '../common/validation.js';
import { ClientsEnabledGuard } from './clients-enabled.guard.js';
import type { ClientSummary } from './clients.repository.js';
import { ClientsService } from './clients.service.js';

// An optional field may arrive empty: it is stored as null, never as an empty string.
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);

const clientSchema = z.object({
  name: z.string().trim().min(1).max(255),
  address: optional(255),
  code: optional(45),
  phone: optional(45),
  // The unique index is on lower(code); the email is lowercased so one address is always written one way.
  email: z
    .string()
    .trim()
    .max(255)
    .nullish()
    .transform((value) => value?.toLowerCase() || null)
    .pipe(z.email().nullable()),
});

const idSchema = z.uuid();

/** Something that is not an id cannot be a client: 404, not a database error. */
function clientId(id: string): string {
  if (!idSchema.safeParse(id).success) {
    throw new NotFoundException('Client not found');
  }
  return id;
}

/** Any logged-in user can manage clients until roles exist (SCRUM-17). Clients are disabled, never deleted. */
@ApiExcludeController()
@Controller('clients')
@UseGuards(ClientsEnabledGuard, JwtAuthGuard)
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  list(): Promise<ClientSummary[]> {
    return this.clients.list();
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<ClientSummary> {
    return this.clients.get(clientId(id));
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: unknown): Promise<ClientSummary> {
    return this.clients.create(parseBody(clientSchema, body));
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ClientSummary> {
    return this.clients.update(clientId(id), parseBody(clientSchema, body));
  }

  @Post(':id/disable')
  @HttpCode(200)
  disable(@Param('id') id: string): Promise<ClientSummary> {
    return this.clients.setActive(clientId(id), false);
  }

  @Post(':id/enable')
  @HttpCode(200)
  enable(@Param('id') id: string): Promise<ClientSummary> {
    return this.clients.setActive(clientId(id), true);
  }
}
