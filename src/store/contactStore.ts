import axios from 'axios';
import { Contact, GroupContact, MessageTypes, Roles, SystemBody, SystemMessageTypes } from '../types';
import config from '@/config';
import { uuidv4 } from '../../src/common/index';
import { useChatsState } from './chatStore';
import { useAuthState } from './authStore';
import { Message, DtId } from '../types/index';

// const state = reactive<State>({
//     contacts:[]
// });

// const retrieveContacts = async () => {
//     return axios.get(`${config.baseUrl}api/contacts`).then(function(response) {
//         const contacts = response.data
//         console.log(`here are the contacts`, contacts)

//         state.contacts = contacts;
//     })

// }

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

const addContact = (username: DtId, location, dontCheck = false) => {
    const { user } = useAuthState();
    const addMessage: Message<SystemBody> = {
        id: uuidv4(),
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
    const chatname: String = username;
    axios
        .post(`${config.baseUrl}api/v1/contacts`, {
            id: username,
            location,
            message: addMessage,
        })
        .then(res => {});
};

const calculateContacts = () => {
    const { chats } = useChatsState();
    const { user } = useAuthState();
    const contacts = chats.value
        .filter(chat => !chat.isGroup && chat.acceptedChat)
        .map(chat => chat.contacts.find(contact => contact.id !== user.id));
    return contacts;
};

export const useContactsState = () => {
    return {
        contacts: calculateContacts(),
        groupContacts: calculateContacts().map((c: Contact) => {
            const contact: GroupContact = {
                ...c,
                roles: [Roles.USER],
            };
            return contact;
        }),
        // ...toRefs(state),
    };
};

export const useContactsActions = () => {
    return {
        // retrieveContacts,
        // setLastMessage,
        addContact,
    };
};

// interface State {
//     contacts: Contact[]
// }
