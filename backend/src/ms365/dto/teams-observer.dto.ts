import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ObserverChannelDto {
  @IsString()
  teamId!: string;

  @IsString()
  channelId!: string;

  @IsString()
  teamName!: string;

  @IsString()
  channelName!: string;

  /** Derived server-side when omitted. */
  @IsOptional()
  @IsString()
  slug?: string;
}

export class PutObserverChannelsDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(3600)
  syncIntervalSec?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  refreshWindowHours?: number;

  @IsOptional()
  @IsBoolean()
  downloadHostedContent?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  backfillDays?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ObserverChannelDto)
  channels!: ObserverChannelDto[];
}
