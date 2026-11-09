import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UploadsController } from './uploads.controller.js';
import { NOW, UploadsService } from './uploads.service.js';
import { URL_SIGNER, gcsUrlSigner } from './url-signer.js';

@Module({
  imports: [AuthModule],
  controllers: [UploadsController],
  providers: [
    UploadsService,
    { provide: URL_SIGNER, useFactory: () => gcsUrlSigner() },
    { provide: NOW, useValue: () => new Date() },
  ],
})
export class UploadsModule {}
