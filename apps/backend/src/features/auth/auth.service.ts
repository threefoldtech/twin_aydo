import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateRandomString, ThreefoldLogin } from '@threefoldjimber/threefold_login/dist';

import { EncryptionService } from '../encryption/encryption.service';
import { KeyService } from '../key/key.service';
import { KeyType } from '../key/models/key.model';

@Injectable()
export class AuthService {
    private tfLogin: ThreefoldLogin;

    constructor(
        private readonly _configService: ConfigService,
        private readonly _keyService: KeyService,
        private readonly _encryptionService: EncryptionService
    ) {}

    /**
     * Generates threefold app login url.
     * @param {string} redirectUrl - Redirection Url.
     * @return {loginState: string, loginUrl: string} - The generated loginState and Url.
     */
    async getAppLogin(host?: string, redirectUrl?: string): Promise<{ loginState: string; loginUrl: string }> {
        try {
            this.tfLogin = new ThreefoldLogin(
                this._configService.get<string>('appBackend'),
                host || this._configService.get<string>('appId'),
                this._configService.get<string>('seedPhrase'),
                redirectUrl ?? '',
                this._configService.get<string>('kycBackend')
            );
            await this.tfLogin.init();
            const loginState = generateRandomString();
            return {
                loginState,
                loginUrl: this.tfLogin.generateLoginUrl(loginState, {
                    scope: '{"email": true, "derivedSeed": true, "digitalTwin": true}',
                }),
            };
        } catch (error) {
            throw new BadRequestException(error);
        }
    }

    /**
     * Gets users profile data
     * @param {URL} redirectUrl - Redirection Url.
     * @param {string} sessionState - Current session state.
     */
    async getProfileData({
        redirectUrl,
        sessionState,
    }: {
        redirectUrl: URL;
        sessionState: string;
    }): Promise<{ doubleName: string; derivedSeed: string; userId: string; email: string }> {
        try {
            const profileData = (await this.tfLogin.parseAndValidateRedirectUrl(redirectUrl, sessionState))?.profile;

            const doubleName: string = <string>profileData.doubleName;
            const derivedSeed: string = <string>profileData.derivedSeed;
            const userId = doubleName.replace('.3bot', '');
            const email: string = <string>profileData.email;
            if (userId !== this._configService.get<string>('userId') || !derivedSeed)
                throw new UnauthorizedException('no user id or derived seed found');

            const seed = this._encryptionService.decodeSeed(derivedSeed);
            const { publicKey, secretKey } = this._encryptionService.getKeyPair(seed);
            if (!publicKey || !secretKey) throw new UnauthorizedException('invalid key pair');

            try {
                await this._keyService.updateKey({ pk: publicKey, keyType: KeyType.Public });
                await this._keyService.updateKey({ pk: secretKey, keyType: KeyType.Private });
            } catch (error) {
                throw new UnauthorizedException(`${error}`);
            }

            return {
                doubleName,
                derivedSeed,
                userId,
                email,
            };
        } catch (error) {
            console.log('This is the error', error);
            throw new BadRequestException(`${error}`);
        }
    }
}
