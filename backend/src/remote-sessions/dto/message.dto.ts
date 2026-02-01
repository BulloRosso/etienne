import { IsString, IsNumber } from 'class-validator';

export class SendMessageDto {
  @IsNumber()
  chatId!: number;

  @IsString()
  message!: string;
}

export class SelectProjectDto {
  @IsNumber()
  chatId!: number;

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
      chatId: number;
      username?: string;
      firstName?: string;
    };
    status: string;
  };
  error?: string;
}
