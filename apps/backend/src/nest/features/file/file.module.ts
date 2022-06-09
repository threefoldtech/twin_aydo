import { forwardRef, Module } from '@nestjs/common';

import { ApiModule } from '../api/api.module';
import { ChatModule } from '../chat/chat.module';
import { KeyModule } from '../key/key.module';
import { LocationModule } from '../location/location.module';
import { QuantumModule } from '../quantum/quantum.module';
import { YggdrasilModule } from '../yggdrasil/yggdrasil.module';
import { FileController } from './file.controller';
import { FileGateway } from './file.gateway';
import { FileService } from './file.service';
import { FileTasks } from './file.tasks';

@Module({
    imports: [
        forwardRef(() => YggdrasilModule),
        ApiModule,
        forwardRef(() => LocationModule),
        KeyModule,
        ChatModule,
        forwardRef(() => QuantumModule),
    ],
    controllers: [FileController],
    providers: [FileService, FileTasks, FileGateway],
    exports: [FileService, FileGateway],
})
export class FileModule {}
