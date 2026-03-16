import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { SecretsManagerService } from './secrets-manager.service';

@Controller('api/secrets-manager')
export class SecretsManagerController {
  constructor(
    private readonly secretsManagerService: SecretsManagerService,
  ) {}

  @Roles('user')
  @Get()
  async listSecrets() {
    const keys = await this.secretsManagerService.listSecrets();
    return { keys };
  }

  @Roles('user')
  @Get(':key')
  async getSecret(@Param('key') key: string) {
    const value = await this.secretsManagerService.getSecret(key);
    if (value === null) {
      return { found: false, key };
    }
    return { found: true, key, value };
  }

  @Roles('user')
  @Put(':key')
  async setSecret(@Param('key') key: string, @Body() body: { value: string }) {
    await this.secretsManagerService.setSecret(key, body.value);
    return { success: true, key };
  }

  @Roles('user')
  @Delete(':key')
  async deleteSecret(@Param('key') key: string) {
    await this.secretsManagerService.deleteSecret(key);
    return { success: true, key };
  }
}
