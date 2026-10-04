import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { MockGateway } from './mock-gateway.service';

@Module({
  controllers: [IncidentsController],
  providers: [PrismaService, AuthGuard, IncidentsService, MockGateway],
})
export class IncidentsModule {}
