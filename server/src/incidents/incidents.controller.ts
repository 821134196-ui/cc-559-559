import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { IncidentsService } from './incidents.service';

const uploadDir = join(process.cwd(), 'uploads');
mkdirSync(uploadDir, { recursive: true });

@UseGuards(AuthGuard)
@Controller('incidents')
export class IncidentsController {
  constructor(private svc: IncidentsService) {}

  @Get()
  list(@Req() req: any, @Query('status') status?: string) {
    return this.svc.list(req.user, status);
  }

  @Get(':id')
  detail(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Query('fullPii') fullPii?: string) {
    return this.svc.detail(req.user, id, fullPii === '1');
  }

  // 报警：值班员登记（最小表单，立即推送急救员）
  @Post()
  @Roles('DISPATCHER', 'ADMIN')
  create(@Req() req: any, @Body() body: any) {
    return this.svc.create(req.user, body);
  }

  // 抢单：急救员（并发安全，唯一有效接手人）
  @Post(':id/accept')
  @Roles('MEDIC')
  accept(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.svc.accept(req.user, id);
  }

  @Post(':id/assess')
  @Roles('MEDIC', 'ADMIN')
  @UseInterceptors(
    FilesInterceptor('files', 6, {
      storage: diskStorage({
        destination: uploadDir,
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname)}`;
          cb(null, unique);
        },
      }),
    }),
  )
  assess(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @UploadedFiles() files: any[],
  ) {
    const dto = { ...body };
    if (typeof body.injuredPerson === 'string') {
      try {
        dto.injuredPerson = JSON.parse(body.injuredPerson);
      } catch {
        dto.injuredPerson = {};
      }
    }
    return this.svc.assess(req.user, id, dto, files || []);
  }

  @Post(':id/treat')
  @Roles('MEDIC', 'ADMIN')
  @UseInterceptors(
    FilesInterceptor('files', 6, {
      storage: diskStorage({
        destination: uploadDir,
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname)}`;
          cb(null, unique);
        },
      }),
    }),
  )
  treat(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @UploadedFiles() files: any[],
  ) {
    return this.svc.treat(req.user, id, body, files || []);
  }

  @Post(':id/family')
  @Roles('MEDIC', 'ADMIN')
  family(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.family(req.user, id, body);
  }

  @Post(':id/handoff')
  @Roles('MEDIC', 'ADMIN')
  handoff(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.handoff(req.user, id, body);
  }

  @Post(':id/hospital')
  @Roles('MEDIC', 'ADMIN')
  hospital(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.hospital(req.user, id, body);
  }

  @Post(':id/escalate')
  escalate(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.escalate(req.user, id, body);
  }

  @Post(':id/correct')
  correct(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.correct(req.user, id, body);
  }

  @Post(':id/false-alarm')
  falseAlarm(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.falseAlarm(req.user, id, body);
  }

  @Post(':id/duplicate')
  @Roles('DISPATCHER', 'ADMIN')
  duplicate(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.markDuplicate(req.user, id, body);
  }

  @Post(':id/close')
  @Roles('ADMIN')
  close(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.close(req.user, id, body);
  }

  @Post(':id/attachments')
  @Roles('MEDIC', 'ADMIN')
  @UseInterceptors(
    FilesInterceptor('files', 6, {
      storage: diskStorage({
        destination: uploadDir,
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname)}`;
          cb(null, unique);
        },
      }),
    }),
  )
  upload(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @UploadedFiles() files: any[],
  ) {
    return this.svc.upload(req.user, id, files || [], body.eventId);
  }
}
