import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { EmotionalActionType, MoodType } from '@prisma/client';

export class SendEmotionalActionDto {
  @IsEnum(EmotionalActionType)
  type: EmotionalActionType;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  message?: string;
}

export class ShareMoodDto {
  @IsEnum(MoodType)
  mood: MoodType;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  note?: string;
}
