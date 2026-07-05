import { IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class SendMessageDto {
  // Telegram numeric ids and Teams conversation-id strings both normalize to string.
  @Transform(({ value }) => (value === undefined || value === null ? value : String(value)))
  @IsString()
  chatId!: string;

  @IsString()
  message!: string;
}

export class SelectProjectDto {
  @Transform(({ value }) => (value === undefined || value === null ? value : String(value)))
  @IsString()
  chatId!: string;

  @IsString()
  projectName!: string;
}

// Response types (not validated by class-validator)
export interface MessageResponse {
  success: boolean;
  response?: string;
  error?: string;
  tokenUsage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface ProjectSelectionResponse {
  success: boolean;
  projectName?: string;
  sessionId?: string;
  error?: string;
}

export interface SessionResponse {
  success: boolean;
  session?: {
    id: string;
    provider: string;
    project: {
      name: string;
      sessionId: string;
    };
    remoteSession: {
      chatId: number | string;
      username?: string;
      firstName?: string;
    };
    status: string;
  };
  error?: string;
}
