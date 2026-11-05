import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller.js';
import { NOW, UploadsService } from './uploads.service.js';
import { URL_SIGNER, gcsUrlSigner } from './url-signer.js';

@Module({
  controllers: [UploadsController],
  providers: [
    UploadsService,
    { provide: URL_SIGNER, useFactory: () => gcsUrlSigner() },
    { provide: NOW, useValue: () => new Date() },
  ],
})
export class UploadsModule {}
