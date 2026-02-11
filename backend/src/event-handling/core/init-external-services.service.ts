import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ProcessManagerService } from '../../process-manager/process-manager.service';

@Injectable()
export class InitExternalServicesService implements OnModuleInit {
  private readonly logger = new Logger(InitExternalServicesService.name);

  constructor(private readonly processManager: ProcessManagerService) {}

  async onModuleInit() {
    if (process.env.IMAP_CONNECTION) {
      try {
        await this.processManager.startService('imap-connector');
        this.logger.log('IMAP Connector auto-started (IMAP_CONNECTION is set)');
      } catch (error) {
        this.logger.error('Failed to auto-start IMAP Connector', error);
      }
    }
  }
}
