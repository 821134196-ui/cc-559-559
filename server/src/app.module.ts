import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuthModule } from './auth/auth.module';
import { IncidentsModule } from './incidents/incidents.module';
import { MockModule } from './mock/mock.module';

@Module({
  imports: [AuthModule, MockModule, IncidentsModule],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
