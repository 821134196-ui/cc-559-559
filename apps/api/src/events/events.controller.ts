import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { AuthGuard, CurrentUser, Roles } from '../auth/auth.guard';
import { UPLOADS_DIR } from '../paths';
import {
  AddEntryDto,
  CloseDto,
  CorrectEntryDto,
  CreateEventDto,
  EscalateDto,
  HandoverDto,
} from './dto';
import { EventsService } from './events.service';

@UseGuards(AuthGuard)
@Controller('events')
export class EventsController {
  constructor(private svc: EventsService) {}

  @Get()
  list(@CurrentUser() user: any, @Query('status') status?: string) {
    return this.svc.list(user, status);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.get(id, user);
  }

  @Post()
  @Roles('DISPATCHER', 'ADMIN')
  create(@CurrentUser() user: any, @Body() dto: CreateEventDto) {
    return this.svc.create(user, dto);
  }

  @Post(':id/claim')
  claim(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.claim(id, user);
  }

  @Post(':id/handover')
  handover(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: HandoverDto,
  ) {
    return this.svc.handover(id, user, dto);
  }

  @Post(':id/escalate')
  escalate(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: EscalateDto,
  ) {
    return this.svc.escalate(id, user, dto);
  }

  @Post(':id/close')
  close(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: CloseDto,
  ) {
    return this.svc.close(id, user, dto);
  }

  @Post(':id/entries')
  addEntry(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: AddEntryDto,
  ) {
    return this.svc.addEntry(id, user, dto);
  }

  @Post(':id/entries/:entryId/correct')
  correct(
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @CurrentUser() user: any,
    @Body() dto: CorrectEntryDto,
  ) {
    return this.svc.correctEntry(id, entryId, user, dto.content);
  }

  @Post(':id/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOADS_DIR,
        filename: (_req, file, cb) =>
          cb(null, `${Date.now()}-${randomUUID()}${extname(file.originalname)}`),
      }),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  upload(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.svc.addAttachment(id, user, file);
  }
}
