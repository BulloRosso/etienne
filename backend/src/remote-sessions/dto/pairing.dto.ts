import { IsString, IsNumber, IsOptional, IsIn } from 'class-validator';

export class PairingRequestDto {
  @IsString()
  @IsIn(['telegram'])
  provider!: 'telegram';

  @IsNumber()
  chatId!: number;

  @IsOptional()
  @IsNumber()
  userId?: number;

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
