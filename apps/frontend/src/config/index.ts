import { bypassAuth, bypassEndpoint } from '@/constants';

interface IConfig {
    spawnerUrl: string;
    baseUrl: string;
    appBackend: string;
    documentServerLocation: string;
    giphyApiKey: string;
    beta: boolean | null;
}

class Config implements IConfig {
    spawnerUrl: string;
    baseUrl: string;
    appBackend: string;
    documentServerLocation: string;
    giphyApiKey: string;
    beta: boolean | null;
    private appId: string | undefined;

    getAppId(): string {
        if (!this.appId) throw new Error('App ID is not set');
        return this.appId;
    }

    setAppId(appId: string | undefined): void {
        this.appId = appId;
    }

    constructor(
        spawnerUrl: string,
        baseUrl: string,
        appBackend: string,
        documentServerLocation: string,
        giphyApiKey: string,
        beta: boolean | null,
        appId: string | undefined
    ) {
        this.spawnerUrl = spawnerUrl;
        this.baseUrl = baseUrl;
        this.appBackend = appBackend;
        this.documentServerLocation = documentServerLocation;
        this.giphyApiKey = giphyApiKey;
        this.beta = beta;
        this.appId = appId;
    }
}

// @ts-ignore
const c = <IConfig>window.config;
const config = new Config(
    c.spawnerUrl,
    bypassAuth ? bypassEndpoint : c.baseUrl,
    c.appBackend,
    c.documentServerLocation,
    c.giphyApiKey,
    c.beta,
    undefined
);

export default config;
