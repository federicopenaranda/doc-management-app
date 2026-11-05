import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth } from 'google-auth-library';
import type { Env } from '../config/env.validation.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { OBJECT_STORE, gcsObjectStore } from './object-store.js';
import { PubsubOidcGuard } from './pubsub-oidc.guard.js';
import { TikaClient } from './tika.client.js';

@Module({
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    PubsubOidcGuard,
    { provide: OBJECT_STORE, useFactory: () => gcsObjectStore() },
    {
      provide: TikaClient,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const auth = new GoogleAuth();
        return new TikaClient(
          // Empty when the flag is off: the client is never used then.
          config.get('TIKA_URL', { infer: true }) ?? '',
          async (audience) => {
            const client = await auth.getIdTokenClient(audience);
            return client.idTokenProvider.fetchIdToken(audience);
          },
        );
      },
    },
  ],
})
export class DocumentsModule {}
