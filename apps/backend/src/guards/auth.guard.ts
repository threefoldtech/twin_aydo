import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';

import { EncryptionService } from '../features/encryption/encryption.service';
import { KeyService } from '../features/key/key.service';
import { KeyType } from '../features/key/models/key.model';
import { YggdrasilService } from '../features/yggdrasil/yggdrasil.service';
import { bypassAuth } from '../constants';

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(
        @Inject(ConfigService) private readonly _configService: ConfigService,
        @Inject(KeyService) private readonly _keyService: KeyService,
        @Inject(EncryptionService) private readonly _encryptionService: EncryptionService,
        @Inject(YggdrasilService) private readonly _yggdrasilService: YggdrasilService
    ) {}

    async canActivate(context: ExecutionContext) {
        if (bypassAuth) {
            return true;
        }

        const isDevelopment = this._configService.get('NODE_ENV') === 'development';
        const userId = this._configService.get<string>('userId');

        const req = context.switchToHttp().getRequest();

        if (isDevelopment) {
            const derivedSeed = randomBytes(32).toString('base64');
            req.session.userId = userId;
            if (!this._yggdrasilService.isInitialised()) await this._yggdrasilService.setupYggdrasil(derivedSeed);

            const seed = this._encryptionService.decodeSeed(derivedSeed);
            const { publicKey, secretKey } = this._encryptionService.getKeyPair(seed);

            await this._keyService.updateKey({ pk: publicKey, keyType: KeyType.Public });
            await this._keyService.updateKey({ pk: secretKey, keyType: KeyType.Private });

            return true;
        }

        const sessionUserId = req.session?.userId;
        if (!sessionUserId) return false;

        const key = await this._keyService.getKey({ keyType: KeyType.Public, userId: sessionUserId });
        if (!key || key.userId !== userId) return false;

        return sessionUserId === userId;
    }
}
