import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export type ChatMessageKind = 'TEXT' | 'IMAGE' | 'SNAP';

export class SendChatMessageDto {
  @IsIn(['TEXT', 'IMAGE', 'SNAP'])
  type: ChatMessageKind;

  @ValidateIf((dto: SendChatMessageDto) => dto.type === 'TEXT')
  @IsString()
  @MaxLength(2000)
  text?: string;

  @ValidateIf((dto: SendChatMessageDto) => dto.type !== 'TEXT')
  @IsString()
  imageData?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  caption?: string;

  @IsOptional()
  @IsBoolean()
  viewOnce?: boolean;
}

export class ReactToMessageDto {
  @IsString()
  @MaxLength(8)
  reaction: string;
}
