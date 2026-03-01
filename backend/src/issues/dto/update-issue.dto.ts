import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';
import { IssueSeverity, IssuePriority, AutonomyLevel } from '../interfaces/issue.interface';

export class RejectIssueDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class UpdatePriorityDto {
  @IsString()
  @IsOptional()
  @IsIn(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])
  severity?: IssueSeverity;

  @IsString()
  @IsOptional()
  @IsIn(['P0', 'P1', 'P2', 'P3'])
  priority?: IssuePriority;
}

export class AddCommentDto {
  @IsString()
  @IsNotEmpty()
  content: string;
}

export class SetAutonomyLevelDto {
  @IsIn([0, 1, 2, 3])
  level: AutonomyLevel;
}
