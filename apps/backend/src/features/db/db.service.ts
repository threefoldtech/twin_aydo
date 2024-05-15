import { Injectable } from '@nestjs/common';
import { Client, Entity, Repository, Schema } from 'redis-om';

// Redis database service
@Injectable()
export class DbService {
    private client: Client;

    private redisURL = `redis://default:PASSWORD@127.0.0.1:6379`;

    constructor() {
        this.client = new Client();
        this.connect();
    }

    /**
     * Connects redis-om client to Redis.
     */
    async connect(): Promise<void> {
        if (!this.client.isOpen()) {
            await this.client.open(this.redisURL);
        }
    }

    /**
     * Creates a repository for given schema.
     * @param {Schema>} schema - Schema to make a repository from.
     * @return {Repository} - The created repository.
     */
    createRepository<T extends Entity>(schema: Schema<T>): Repository<T> {
        return this.client.fetchRepository(schema);
    }

    /**
     * Creates indexes based on the repository's schema
     * @param {Repository} repo - The repository to make indexes on
     */
    async createIndex<T extends Entity>(repo: Repository<T>): Promise<void> {
        await repo.createIndex();
    }
}
