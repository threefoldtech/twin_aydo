import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApiService } from '../api/api.service';
import { ContactDTO } from '../contact/dtos/contact.dto';
import { EncryptionService } from '../encryption/encryption.service';
import { MessageDTO } from '../message/dtos/message.dto';
import { Key, KeyType } from './models/key.model';
import { KeyRedisRepository } from './repositories/key-redis.repository';
import { bypassAuth } from '../../constants';

@Injectable()
export class KeyService {
    constructor(
        private readonly _keyRepo: KeyRedisRepository,
        private readonly _configService: ConfigService,
        private readonly _encryptionService: EncryptionService,
        private readonly _apiService: ApiService
    ) {}

    /**
     * Updates either private or public key based on the key type.
     * @param {Object} obj - Object.
     * @param {Uint8Array} obj.pk - Private/Public key in Uint8Array format.
     * @param {KeyType} obj.keyType - Identifies a key as public or private.
     * @return {Key} - Created entity.
     */
    async updateKey({ pk, keyType }: { pk: Uint8Array; keyType: KeyType }): Promise<Key> {
        const pkString = this._encryptionService.uint8ToBase64(pk);
        const userId = this._configService.get<string>('userId');
        const existingKey = await this.getKey({ keyType, userId });

        if (!existingKey)
            try {
                return this._keyRepo.createKey({
                    userId,
                    key: pkString,
                    keyType,
                } as Key);
            } catch (error) {
                throw new BadRequestException(`error creating ${keyType} key: ${error}`);
            }

        existingKey.key = pkString;
        await this._keyRepo.updateKey(existingKey);
        return existingKey;
    }

    /**
     * Adds an external contacts public key to cache.
     * @param {Object} obj - Object.
     * @param {Uint8Array} obj.pk - Private/Public key in Uint8Array format.
     * @param {string} obj.userId - Contact Id.
     * @return {Key} - Created Key entity.
     */
    async addContactPublicKey({ key, userId }: { key: string; userId: string }): Promise<Key> {
        try {
            return this._keyRepo.createKey({
                userId,
                key,
                keyType: KeyType.Public,
            } as Key);
        } catch (error) {
            throw new BadRequestException(error);
        }
    }

    /**
     * Gets the public or private key of logged in user.
     * @param {Object} obj - Object.
     * @param {KeyType} obj.keyType - Key type to get.
     * @param {string} obj.userId - User Id to get key from.
     * @return {Key} - Found public or private key.
     */
    async getKey({ keyType, userId }: { keyType: KeyType; userId: string }): Promise<Key> {
        if (bypassAuth) {
            return {
                userId,
                key: 'key',
                keyType,
            } as Key;
        }

        try {
            return this._keyRepo.getKey({ keyType, userId });
        } catch (error) {
            throw new NotFoundException(`${keyType} key not found for userId: ${userId}, error: ${error}`);
        }
    }

    /**
     * Adds a signed base64 signature to the message.
     * @param {MessageDTO} message - Message to add signature to.
     * @return {MessageDTO} - message with appended signature.
     */
    async appendSignatureToMessage({ message }: { message: MessageDTO<unknown> }): Promise<MessageDTO<unknown>> {
        const userId = this._configService.get<string>('userId');

        const { key } = await this.getKey({ keyType: KeyType.Private, userId });
        if (!key) return;
        const signature = this._encryptionService.createBase64Signature({ data: message, secretKey: key });
        console.log({ key });
        message.signatures ? message.signatures.unshift(signature) : (message.signatures = [signature]);

        return message;
    }

    /**
     * Verifies a message's signature.
     * @param {Object} obj - Object.
     * @param {Contact} obj.contact - Contact to get public key from.
     * @param {Message} obj.message - Message with signature.
     * @param {string} obj.signature - Signature to verify.
     * @return {boolean} - Message signature is valid or not.
     */
    async verifyMessageSignature<T>({
        contact,
        message,
        signature,
    }: {
        contact: ContactDTO;
        message: MessageDTO<T>;
        signature: string;
    }): Promise<boolean> {
        const signatureIdx = message.signatures.findIndex(s => s === signature);
        if (signatureIdx <= -1) return false;

        // let pk: Key | { key: string } = await this.getPublicKeyByUserID(contact.id);
        const key = await this._apiService.getContactPublicKey({ location: contact.location });
        console.log(`KEY: ${key}`);
        if (!key) return false;
        // await this.addContactPublicKey({ key, userID: contact.id });
        const messageWithoutSignature = {
            ...message,
            signatures: message.signatures.slice(signatureIdx + 1, message.signatures.length),
        } as MessageDTO<T>;

        return this._encryptionService.verifySignature({
            data: messageWithoutSignature,
            signature,
            publicKey: key,
        });
    }
}
