import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { MockModule } from './mock/mock.module';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
class PrismaModule {}

@Module({
  imports: [PrismaModule, AuthModule, EventsModule, MockModule],
})
export class AppModule {}
