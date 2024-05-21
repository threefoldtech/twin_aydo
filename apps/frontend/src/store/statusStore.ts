import axios from 'axios';
import { ref } from 'vue';
import { reactive } from '@vue/reactivity';
import { useAuthState } from '@/store/authStore';
import { calcExternalResourceLink } from '@/services/urlService';
import { Contact } from '@/types';
import config from '@/config';

export const statusList = reactive<Object>({});
export const fetching: string[] = [];
export const watchingUsers = [];
export const showUserOfflineMessage = ref(false);

export const fetchStatus = async (digitalTwinId: string, fetch = false) => {
    if (statusList[digitalTwinId] && !fetch) {
        return statusList[digitalTwinId];
    }
    const { user } = useAuthState();
    const locationApiEndpoint = '/api/v2/user/status';
    let location = '';
    if (digitalTwinId == user.id) {
        location = `${config.baseUrl}${locationApiEndpoint}`;
    } else {
        location = calcExternalResourceLink(
            `http://[${watchingUsers[<string>digitalTwinId].location}]${locationApiEndpoint}`
        );
    }
    try {
        const { data } = await axios.get(location, { timeout: 5000 });
        statusList[<string>digitalTwinId] = data;
        return data;
    } catch (error) {
        showUserOfflineMessage.value = true;
    }
};

export const startFetchStatus = async (contact: Contact) => {
    if (watchingUsers.find(wu => wu === contact.id) && !statusList[<string>contact.id]) {
        await fetchStatus(contact.id);
        return;
    }

    watchingUsers.push(contact.id);
    watchingUsers[<string>contact.id] = {
        location: contact.location,
    };
    fetching.push(<string>contact.id);

    await fetchStatus(contact.id);
    fetching.splice(fetching.indexOf(<string>contact.id), 1);
};
