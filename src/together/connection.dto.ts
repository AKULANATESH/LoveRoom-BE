import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateCalendarEventDto {
  @IsString()
  @MaxLength(120)
  title: string;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;
}

export class UpdateLocationDto {
  @ValidateIf((dto: UpdateLocationDto) => dto.isSharing)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ValidateIf((dto: UpdateLocationDto) => dto.isSharing)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracy?: number;

  @IsBoolean()
  isSharing: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  locationLabel?: string;
}

export class RecordHourlyTouchDto {
  @IsOptional()
  @IsInt()
  @Min(8)
  @Max(21)
  hour?: number;
}
