import { BadRequestException, Injectable } from '@nestjs/common';

import { ApiService } from '../api/api.service';
import { EncryptionService } from '../encryption/encryption.service';
import { YggdrasilService } from '../yggdrasil/yggdrasil.service';
import { LocationResponse } from './types/responses';
import { bypassAuth } from '../../constants';

@Injectable()
export class LocationService {
    private location = '';

    constructor(
        private readonly _encryptionService: EncryptionService,
        private readonly _apiService: ApiService,
        private readonly _yggdrasilService: YggdrasilService
    ) {}

    /**
     * Gets locations (IPv6) of all registered Yggdrasil twins.
     * @return {LocationResponse} - The locations.
     */
    getLocations(): LocationResponse {
        return {
            data: [
                {
                    id: 1,
                    location: 'localhost',
                },
                {
                    id: 2,
                    location: 'localhost',
                },
            ],
        };
    }

    /**
     * Gets current location (IPv6) of own connection.
     * @return {string} - Own address.
     * @return {Error} - Error.
     */
    async getOwnLocation(): Promise<string | Error> {
        if (bypassAuth) {
            return 'address';
        }

        if (this.location === '') this.location = (await this._yggdrasilService.getSelf()) as string;
        if (this.location.length < 1) return null;
        return this.location;
    }

    /**
     * Registers digital twin location to the central users backend API.
     * @param {Object} obj - Object.
     * @param {string} obj.doubleName - Username paired with .3bot.
     * @param {string} obj.derivedSeed - The derived seed.
     * @param {string} obj.yggdrasilAddress - Unsigned Yggdrasil address.
     */
    async registerDigitalTwin({
        doubleName,
        derivedSeed,
        yggdrasilAddress,
    }: {
        doubleName: string;
        derivedSeed: string;
        yggdrasilAddress: string;
    }): Promise<void> {
        const seed = this._encryptionService.decodeSeed(derivedSeed);
        const keyPair = this._encryptionService.getKeyPair(seed);
        const data = this._encryptionService.decodeAddress(yggdrasilAddress);
        const signedAddress = this._encryptionService.signAddress({ data, secretKey: keyPair.secretKey });

        console.log(doubleName);
        console.log(yggdrasilAddress);
        try {
            await this._apiService.registerDigitalTwin({ doubleName, signedAddress });
        } catch (error) {
            console.log('custom error', error);
            throw new BadRequestException(error);
        }
    }
}
