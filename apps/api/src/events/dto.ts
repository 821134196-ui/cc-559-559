import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  location: string;

  @IsISO8601()
  occurredAt: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  injuredName: string;

  @IsOptional()
  @IsString()
  injuredGender?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null || value === undefined ? null : Number(value),
  )
  @IsInt()
  injuredAge?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  injuredContact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn(['NORMAL', 'HIGH'])
  riskLevel?: string;

  /** 可选：报警时直接指定当前处置人（留空则由急救员抢单） */
  @IsOptional()
  @IsString()
  assigneeId?: string;
}

export class AddEntryDto {
  @IsIn(['ASSESSMENT', 'FAMILY_CONTACT', 'TRANSFER', 'NOTE'])
  type: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content: string;

  @IsOptional()
  meta?: Record<string, any>;
}

export class CorrectEntryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content: string;
}

export class HandoverDto {
  @IsString()
  @IsNotEmpty()
  toUserId: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class EscalateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}

export class CloseDto {
  @IsIn(['RESOLVED', 'FALSE_ALARM', 'DUPLICATE'])
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  /** 重复报警时指向原事件（ID 或编号均可） */
  @IsOptional()
  @IsString()
  duplicateOfId?: string;
}
