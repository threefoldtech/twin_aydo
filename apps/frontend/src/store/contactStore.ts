import axios from 'axios';
import { Contact, DtContact, GroupContact, MessageTypes, Roles, SystemBody, SystemMessageTypes } from '@/types';
import config from '@/config';
import { uuidv4 } from '@/common';
import { useAuthState } from './authStore';
import { Message } from '../types/index';
import { reactive, toRefs } from 'vue';

const state = reactive<ContactState>({
    contacts: [],
    dtContacts: [],
});

const retrieveContacts = async () => {
    const { data } = await axios.get(`${config.baseUrl}api/v2/contacts`);
    state.contacts = data;
    return data;
};

const retrieveDTContacts = async () => {
    if (state.dtContacts.length > 0) return state.dtContacts;

    const { data } = await axios.get(`${config.appBackend}api/users/digitaltwin`);
    state.dtContacts = data;
    return data;
};

// const contactIsHealthy = (location) => {
//     let isAvailable = false
//     axios.get(`https://${location}.digitaltwin.jimbertesting.be/api/healthcheck`).then( (res) => {
//         console.log(res)
//         isAvailable = true
//     }).catch( res => {
//         isAvailable = false
//     })
//     return isAvailable
// }

const addContact = async (username: string, location: string, _dontCheck = false) => {
    const { user } = useAuthState();
    const addMessage: Message<SystemBody> = {
        id: uuidv4(),
        chatId: username,
        body: {
            type: SystemMessageTypes.CONTACT_REQUEST_SEND,
            message: `Request has been sent to ${username}`,
        },
        from: user.id,
        to: username,
        timeStamp: new Date(),
        type: MessageTypes.SYSTEM,
        replies: [],
        subject: null,
    };

    const { data } = await axios.post(`${config.baseUrl}/api/v2/contacts`, {
        id: username,
        location,
        message: addMessage,
    });
    if (data) state.contacts.push(data.entityData);
};

export const useContactsState = () => {
    return {
        ...toRefs(state),
        contacts: state.contacts,
        groupContacts: state.contacts.map((c: Contact) => {
            const contact: GroupContact = {
                ...c,
                roles: [Roles.USER],
            };
            return contact;
        }),
        dtContacts: state.dtContacts,
        // ...toRefs(state),
    };
};

// const calculateContacts = () => {
//     const { chats } = useChatsState();
//     const { user } = useAuthState();
//     const contacts = chats.value
//         .filter(chat => !chat.isGroup && chat.acceptedChat)
//         .map(chat => chat.contacts.find(contact => contact.id !== user.id));
//     return contacts;
// };

export const useContactsActions = () => {
    return {
        retrieveContacts,
        // setLastMessage,
        addContact,
        retrieveDTContacts,
    };
};

interface ContactState {
    contacts: Contact[];
    dtContacts: Contact[];
}
