import { bypassAuth, bypassEndpoint } from '@/constants';

export const calculateBaseUrl = (userId: string) => {
    if (window.location.origin === 'http://localhost:8080') return 'http://localhost:3000';

    let url: Array<String> = window.location.host.split('.');
    url.splice(0, 1);
    return `https://${userId}.${url.join('.')}`;
};

export const calcExternalResourceLink = (location: string) => {
    return `${bypassAuth ? bypassEndpoint : window.location.origin}/api/v2/external/resource?loc=${location}`;
};
