import { IsString, IsBoolean, IsObject, IsNotEmpty, IsOptional } from 'class-validator';
import { EventCondition, RuleAction } from '../interfaces/event.interface';

export class CreateRuleDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean = true;

  @IsObject()
  @IsNotEmpty()
  condition: EventCondition;

  @IsObject()
  @IsNotEmpty()
  action: RuleAction;
}

export class UpdateRuleDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsObject()
  @IsOptional()
  condition?: EventCondition;

  @IsObject()
  @IsOptional()
  action?: RuleAction;
}
