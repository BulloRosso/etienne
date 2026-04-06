import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { AuthGatewayController } from './auth-gateway.controller';
import { AzureEntraIdProvider } from './providers/azure-entraid.provider';
import { AwsCognitoProvider } from './providers/aws-cognito.provider';
import { RoleMapperService } from './providers/role-mapper';

@Module({
  controllers: [AuthGatewayController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    AzureEntraIdProvider,
    AwsCognitoProvider,
    RoleMapperService,
  ],
})
export class AuthModule {}
