import config from '@/config';

export const calculateBaseUrl = (userId: string) => {
    if (window.location.origin === 'http://localhost:8081') return 'http://localhost:3001';

    let url: Array<String> = window.location.host.split('.');
    url.splice(0, 1);
    return `https://${userId}.${url.join('.')}`;
};

export const calcExternalResourceLink = (location: string) => {
    return `${config.baseUrl}/api/v2/external/resource?loc=${location}`;
};
