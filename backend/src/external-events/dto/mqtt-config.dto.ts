import { IsString, IsNotEmpty, IsOptional, IsNumber, IsArray } from 'class-validator';

export class MqttBrokerConfigDto {
  @IsString()
  @IsNotEmpty()
  host!: string;

  @IsNumber()
  @IsNotEmpty()
  port!: number;

  @IsString()
  @IsOptional()
  username?: string;

  @IsString()
  @IsOptional()
  password?: string;
}

export class MqttSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  topic!: string;

  @IsNumber()
  @IsOptional()
  qos?: number;
}

export class MqttConfigDto {
  @IsOptional()
  broker?: MqttBrokerConfigDto;

  @IsArray()
  @IsOptional()
  subscriptions?: string[];
}
