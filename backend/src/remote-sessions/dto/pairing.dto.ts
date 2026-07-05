import { IsString, IsOptional, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';
import { RemoteProvider } from '../interfaces/remote-session.interface';

export class PairingRequestDto {
  @IsString()
  @IsIn(['telegram', 'teams'])
  provider!: RemoteProvider;

  // Telegram sends numeric ids, Teams sends conversation-id strings
  // (19:...@thread.tacv2) — normalize both to string.
  @Transform(({ value }) => (value === undefined || value === null ? value : String(value)))
  @IsString()
  chatId!: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null ? value : String(value)))
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;
}

export class PairingResponseDto {
  @IsString()
  id!: string;

  @IsString()
  @IsIn(['approve', 'deny'])
  action!: 'approve' | 'deny';

  @IsOptional()
  @IsString()
  message?: string;
}

// Response types (not validated by class-validator)
export interface PairingRequestResponse {
  success: boolean;
  id: string;
  code: string;
  expires_at: string;
}

export interface PairingApprovalResponse {
  success: boolean;
  sessionId?: string;
  error?: string;
}
