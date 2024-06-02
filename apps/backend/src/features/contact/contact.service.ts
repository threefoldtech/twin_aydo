import { BadRequestException, forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ContactRequest, MessageBody, MessageType } from '../../types/message-types';
import { uuidv4 } from '../../utils/uuid';
import { ApiService } from '../api/api.service';
import { BlockedContactService } from '../blocked-contact/blocked-contact.service';
import { ChatGateway } from '../chat/chat.gateway';
import { ChatService } from '../chat/chat.service';
import { KeyService } from '../key/key.service';
import { LocationService } from '../location/location.service';
import { CreateMessageDTO, MessageDTO } from '../message/dtos/message.dto';
import { MessageService } from '../message/message.service';
import { Message } from '../message/models/message.model';
import { CreateContactDTO, DeleteContactDTO, UpdateContactDTO } from './dtos/contact.dto';
import { Contact } from './models/contact.model';
import { ContactRedisRepository } from './repositories/contact-redis.repository';

@Injectable()
export class ContactService {
    constructor(
        private readonly _contactRepo: ContactRedisRepository,
        private readonly _messageService: MessageService,
        private readonly _locationService: LocationService,
        private readonly _configService: ConfigService,
        private readonly _keyService: KeyService,
        private readonly _apiService: ApiService,
        @Inject(forwardRef(() => ChatService))
        private readonly _chatService: ChatService,
        @Inject(forwardRef(() => BlockedContactService))
        private readonly _blockedContactService: BlockedContactService,
        @Inject(forwardRef(() => ChatGateway))
        private readonly _chatGateway: ChatGateway
    ) {}

    /**
     * Gets contacts using pagination.
     * @return {EntityData[]} - Found contacts entity data.
     */
    async getContacts(): Promise<Contact[]> {
        try {
            return (await this._contactRepo.getContacts()).filter(c => c.accepted);
        } catch {
            return [];
        }
    }

    /**
     * Gets a contact by id.
     * @param {string} id - Contact id.
     * @return {Contact} - Found contact.
     */
    async getContact({ id }: { id: string }): Promise<Contact> {
        try {
            return await this._contactRepo.getContact({ id });
        } catch (error) {
            throw new NotFoundException('contact not found');
        }
    }

    /**
     * Gets a contact by location.
     * @param {string} location - Contact location.
     * @return {Contact} - Found contact.
     */
    async getContactByLocation({ location }: { location: string }): Promise<Contact> {
        try {
            return await this._contactRepo.getContactByLocation({ location });
        } catch (error) {
            return null;
        }
    }

    /**
     * Gets all contacts that are not blocked.
     * @return {Contact[]} - Contacts.
     */
    async getUnblockedContacts(): Promise<Contact[]> {
        const contacts = await this.getContacts();
        const blockedContacts = await this._blockedContactService.getBlockedContactIds();

        return contacts.filter(contact => !blockedContacts.includes(contact.id));
    }

    /**
     * Creates a new contact.
     * @param {Object} obj - Object.
     * @param {string} obj.id - Contact ID.
     * @param {string} obj.location - Contact IPv6.
     * @param {CreateMessageDTO} obj.message - Contact request message.
     * @return {Contact} - Created entity.
     */
    async createNewContact({ id, location, message }: CreateContactDTO<MessageBody>): Promise<Contact> {
        console.log({ id, location, message });

        const yggdrasilAddress = await this._locationService.getOwnLocation();
        const me = {
            id: this._configService.get<string>('userId'),
            location: yggdrasilAddress as string,
        };

        let newContact = await this.getContact({ id });
        if (newContact?.accepted) message.body.message = `You can now start chatting with ${newContact.id} again`;

        console.log('here tyb?');

        if (!newContact) {
            try {
                newContact = await this._contactRepo.addNewContact({
                    id,
                    location,
                    contactRequest: false,
                    accepted: false,
                    containerOffline: false,
                });
            } catch (error) {
                throw new BadRequestException(`unable to create contact: ${error}`);
            }
        }
        const signedMessage = await this._keyService.appendSignatureToMessage({ message });
        const newMessage = await this._messageService.createMessage(signedMessage);
        const chat = await this._chatService.createChat({
            chatId: newContact.id,
            name: newMessage.to,
            contacts: [newContact, me],
            acceptedChat: true,
            adminId: newContact.id,
            read: [],
            isGroup: false,
            messages: [signedMessage],
        });

        const contactRequest: MessageDTO<ContactRequest> = {
            id: uuidv4(),
            chatId: chat.chatId,
            from: newMessage.from,
            to: newContact.id,
            body: {
                id: newMessage.from,
                location: yggdrasilAddress as string,
            },
            timeStamp: new Date(),
            type: MessageType.CONTACT_REQUEST,
            subject: null,
            signatures: [],
            replies: [],
        };
        const signedContactRequest = await this._keyService.appendSignatureToMessage({
            message: contactRequest as unknown as Message,
        });

        this._chatGateway.emitMessageToConnectedClients('connection_request', {
            ...chat.toJSON(),
            messages: [signedMessage],
        });

        await this._apiService.sendMessageToApi({ location: newContact.location, message: signedContactRequest });

        return newContact;
    }

    /**
     * Creates a new contact request.
     * @param {Object} obj - Object.
     * @param {string} obj.id - Contact ID.
     * @param {string} obj.location - Contact IPv6.
     * @param {CreateMessageDTO} obj.message - Contact request message.
     * @return {Contact} - Created entity.
     */
    async handleIncomingContactRequest({ id, location, message }: CreateContactDTO<ContactRequest>): Promise<Contact> {
        const yggdrasilAddress = await this._locationService.getOwnLocation();
        const me = {
            id: this._configService.get<string>('userId'),
            location: yggdrasilAddress as string,
        };

        const existingContact = await this.getContact({ id });
        const existingMessages = await this._messageService.getAllMessagesFromChat({ chatId: existingContact?.id });
        const existingChat = existingContact ? await this._chatService.getChat(existingContact?.id) : undefined;

        if (existingContact && existingChat) {
            await this.updateContact({
                id,
                contactRequest: false,
                accepted: true,
                containerOffline: false,
            });
            await this._apiService.acceptContactRequest({ ownId: me.id, contactLocation: location });
        }

        if (existingContact && existingMessages.length > 0) return;

        let newContact;
        try {
            newContact =
                existingContact ??
                (await this._contactRepo.addNewContact({
                    id,
                    location,
                    contactRequest: true,
                    accepted: false,
                    containerOffline: false,
                }));
        } catch (error) {
            throw new BadRequestException(`unable to create contact: ${error}`);
        }

        const contactRequestMsg: CreateMessageDTO<string> = {
            id: uuidv4(),
            chatId: message.from,
            from: message.from,
            to: message.to,
            body: JSON.stringify(`You have received a new message request from ${message.from}`),
            timeStamp: new Date(),
            type: MessageType.SYSTEM,
            subject: null,
            signatures: message.signatures ?? [],
            replies: [],
        };
        await this._messageService.createMessage(contactRequestMsg);

        const chat = await this._chatService.createChat({
            chatId: message.from,
            name: message.from,
            contacts: [me, newContact],
            acceptedChat: false,
            adminId: message.from,
            read: [],
            isGroup: false,
            messages: [contactRequestMsg],
        });

        this._chatGateway.emitMessageToConnectedClients('connection_request', chat);
        return newContact;
    }

    /**
     * Gets a contact that has accepted the chat request (contactRequest is false).
     * @param {string} id - Contacts Id.
     * @return {Contact} - Found contact.
     */
    async getAcceptedContact({ id }: { id: string }): Promise<Contact> {
        try {
            return await this._contactRepo.getAcceptedContact({ id });
        } catch (error) {
            throw new NotFoundException(`contact not found`);
        }
    }

    /**
     * Adds an existing contact.
     * @param {Object} obj - Object.
     * @param {string} obj.id - Contact ID.
     * @param {string} obj.location - Contact IPv6.
     * @return {Contact} - Contact entity.
     */
    async addContact({ id, location }: CreateContactDTO<ContactRequest>): Promise<Contact> {
        const existingContact = await this.getContact({ id });
        if (existingContact) return;
        try {
            return await this._contactRepo.addNewContact({
                id,
                location,
                contactRequest: false,
                accepted: false,
                containerOffline: false,
            });
        } catch (error) {
            throw new BadRequestException(`unable to add contact: ${error}`);
        }
    }

    /**
     * Deletes a contact.
     * @param {string} id - Contact ID.
     */
    async deleteContact({ id }: DeleteContactDTO): Promise<void> {
        const contact = await this.getContact({ id });
        if (contact?.entityId) {
            try {
                this._apiService.deleteContact({
                    ownId: this._configService.get<string>('userId'),
                    location: contact.location,
                });
                return await this._contactRepo.deleteContact({ id: contact.entityId });
            } catch (error) {
                throw new BadRequestException(`unable remove contact: ${error}`);
            }
        }
    }

    /**
     * Updates a contact.
     * @param {Object} obj - Object.
     * @param {string} obj.id - Contact ID.
     * @param {boolean} obj.contactRequest - Contact request.
     * @param {boolean} obj.accepted - Chat accepted.
     */
    async updateContact({ id, contactRequest, accepted, containerOffline }: UpdateContactDTO): Promise<Contact> {
        const contact = await this.getContact({ id });
        if (!contact) return;
        contact.contactRequest = contactRequest;
        contact.accepted = accepted;
        contact.containerOffline = containerOffline;
        try {
            return await this._contactRepo.updateContact({ contact });
        } catch (error) {
            throw new BadRequestException(`unable to update contact: ${error}`);
        }
    }

    async setContactAccepted(id: string, accepted: boolean): Promise<Contact> {
        const contact = await this.getContact({ id });
        if (!contact) return;
        contact.accepted = accepted;
        try {
            return await this._contactRepo.updateContact({ contact });
        } catch (error) {
            throw new BadRequestException(`unable to update contact: ${error}`);
        }
    }

    async setOfflineContacts(contacts: Contact[]): Promise<void> {
        try {
            for (const contact of contacts) {
                const alreadyOffline = contact.containerOffline;
                contact.containerOffline = !(await this._apiService.containerHealth(contact.location));

                if (contact.containerOffline === alreadyOffline) continue;
                await this._contactRepo.updateContact({ contact });
            }
        } catch (error) {
            throw new BadRequestException(error);
        }
    }
}
