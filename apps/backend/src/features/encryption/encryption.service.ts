import { BadRequestException, Injectable } from '@nestjs/common';
import { box, BoxKeyPair, hash, randomBytes, sign, SignKeyPair } from 'tweetnacl';
import { decodeBase64 } from 'tweetnacl-util';
import { crypto_box_seal, crypto_sign_ed25519_pk_to_curve25519 } from 'libsodium-wrappers';
import { bypassAuth } from '../../constants';

@Injectable()
export class EncryptionService {
    /**
     * Generates a new signed key pair from user seed.
     * @param {Uint8Array} seed.
     * @return {SignKeyPair} - The generated signed key pair values.
     */
    getKeyPair(seed: Uint8Array): SignKeyPair {
        return sign.keyPair.fromSeed(seed);
    }

    /**
     * Gets the encryption key pair.
     * @param {Uint8Array} key.
     * @return {BoxKeyPair} - The generated encryption key pair values.
     */
    getEncryptionKeyPair(key: Uint8Array): BoxKeyPair {
        return box.keyPair.fromSecretKey(key);
    }

    /**
     * Creates a hash from given seed
     * @param {string} seed - Seed to make hash from.
     * @return {Uint8Array} - The generated hash in Uint8Array format.
     */
    generateHashFromSeed(seed: string): Uint8Array {
        return hash(Buffer.from(seed)).slice(0, 32);
    }

    /**
     * Generates a base64 string from a Uint8Array.
     * @param {Uint8Array} uint8array - The Uint8Array.
     * @return {string} - The generated base64.
     */
    uint8ToBase64(uint8array: Uint8Array): string {
        return Buffer.from(uint8array).toString('base64');
    }

    /**
     * Generates a Uint8Array from from a base64 string.
     * @param {string} base64 - The base64.
     * @return {Uint8Array} - The generated Uint8Array.
     */
    base64ToUint8Array(base64: string): Uint8Array {
        return new Uint8Array(decodeBase64(base64));
    }

    /**
     * Generates a base64 string from an object.
     * @param {unknown} data - The object.
     * @return {string} - The generated base64 string.
     */
    objectToBase64(data: unknown): string {
        return Buffer.from(JSON.stringify(data)).toString('base64');
    }

    /**
     * Generates a Uint8Array from an object.
     * @param {unknown} data - The object.
     * @return {Uint8Array} - The generated Uint8Array.
     */
    objectToUint8Array(data: unknown): Uint8Array {
        return this.base64ToUint8Array(this.objectToBase64(data));
    }

    /**
     * Encodes a Uint8Array to string.
     * @param {Uint8Array} bytes - the HEX to encode.
     * @return {string} - The encoded HEX.
     */
    encodeHex(bytes: Uint8Array): string {
        return bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');
    }

    /**
     * Decodes a string to a Uint8Array with hexString.
     * @param {string} hexString - the string to decode.
     * @return {Uint8Array} - The decoded HEX.
     */
    decodeHex(hexString: string): Uint8Array {
        return new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    }

    /**
     * Decodes a seed to a Uint8Array with decodeBase64.
     * @param {string} seed - the seed to decode.
     * @return {Uint8Array} - The decoded seed.
     */
    decodeSeed(seed: string): Uint8Array {
        return new Uint8Array(decodeBase64(seed));
    }

    /**
     * Decodes an address to a Uint8Array using Buffer.
     * @param {string} address - the address to decode.
     * @return {Uint8Array} - The decoded address.
     */
    decodeAddress(address: string): Uint8Array {
        return new Uint8Array(Buffer.from(address));
    }

    /**
     * Signs an address to a string.
     * @param {Object} obj - Object.
     * @param {Uint8Array} obj.data - the address data.
     * @param {Uint8Array} obj.secretKey - secret key to sign address with.
     * @return {string} - The signed address.
     */
    signAddress({ data, secretKey }: { data: Uint8Array; secretKey: Uint8Array }): string {
        return Buffer.from(sign(data, secretKey)).toString('base64');
    }

    /**
     * Creates a Uint8Array signature with a secret key.
     * @param {Object} obj - Object.
     * @param {unknown} obj.data - The data needed in the signature.
     * @param {string} obj.secretKey - the secret key to for the signature.
     * @return {Uint8Array} - The signed signature.
     */
    createSignature({ data, secretKey }: { data: unknown; secretKey: string }): Uint8Array {
        if (!data || !secretKey) throw new BadRequestException('invalid signature data or secret key');

        if (bypassAuth) {
            return Uint8Array.from(Buffer.from(JSON.stringify(data)));
        }

        try {
            return sign.detached(this.objectToUint8Array(data), decodeBase64(secretKey));
        } catch (error) {
            throw new BadRequestException(error);
        }
    }

    /**
     * Creates a base64 string from a Uint8Array signature.
     * @param {Object} obj - Object.
     * @param {unknown} obj.data - The data needed in the signature.
     * @param {string} obj.secretKey - The secret key to for the signature.
     * @return {Uint8Array} - The signed signature in base64.
     */
    createBase64Signature({ data, secretKey }: { data: unknown; secretKey: string }): string {
        const signature = this.createSignature({ data, secretKey });
        console.log({ signature });

        if (!signature) throw new BadRequestException('invalid signature');
        return this.uint8ToBase64(signature);
    }

    /**
     * Verifies data signature using public key.
     * @param {Object} obj - Object.
     * @param {unknown} obj.data - The data with the signature.
     * @param {string} obj.signature - The signature to be verified.
     * @param {string} obj.publicKey - The public key to verify signature.
     * @return {boolean} - Is a valid signature or not.
     */
    verifySignature({ data, signature, publicKey }: { data: unknown; signature: string; publicKey: string }): boolean {
        return sign.detached.verify(
            this.objectToUint8Array(data),
            this.base64ToUint8Array(signature),
            decodeBase64(publicKey)
        );
    }

    encryptData({ data, publicKey }: { data: string; publicKey: string }): string {
        const dataInBytes = this.base64ToUint8Array(Buffer.from(data).toString('base64'));

        const decodedPublicKey = this.base64ToUint8Array(publicKey);

        const encryptionKey: Uint8Array = crypto_sign_ed25519_pk_to_curve25519(decodedPublicKey);

        return this.uint8ToBase64(crypto_box_seal(dataInBytes, encryptionKey, 'uint8array'));
    }
}
