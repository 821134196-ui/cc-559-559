import { Module } from '@nestjs/common';
import { MockModule } from '../mock/mock.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [MockModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
