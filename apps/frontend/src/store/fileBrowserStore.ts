import { ref, watch } from 'vue';
import fileDownload from 'js-file-download';
import * as Api from '@/services/fileBrowserService';
import { getShareWithId, hasSpecialCharacters } from '@/services/fileBrowserService';
import { setImageSrc } from '@/store/imageStore';
import moment from 'moment';
import { createErrorNotification, createNotification } from '@/store/notificiationStore';
import { Status } from '@/types/notifications';
import { useAuthState } from '@/store/authStore';
import {
    Chat,
    ContactInterface,
    FileShareMessageType,
    MessageBodyType,
    MessageTypes,
    SharedFileInterface,
    SharePermissionInterface,
} from '@/types';
import axios from 'axios';
import { calcExternalResourceLink } from '@/services/urlService';
import { watchingUsers } from '@/store/statusStore';
import router from '@/plugins/Router';
import { AppType } from '@/types/apps';
import { usechatsActions, useChatsState } from './chatStore';
import { isArray } from 'lodash';
import { decodeString } from '@/utils/files';
import config from '@/config';

declare const Buffer;

export enum FileType {
    Unknown = 'unknown',
    Word = 'word',
    Video = 'video',
    Pdf = 'pdf',
    Csv = 'csv',
    Audio = 'audio',
    Archive = 'archive',
    Excel = 'excel',
    Powerpoint = 'powerpoint',
    Image = 'image',
    Text = 'text',
    Html = 'html',
}

export enum Action {
    CUT,
    COPY,
}

export enum View {
    LIST,
    GRID,
}

export interface PathInfoModel extends Api.PathInfo {
    fileType: FileType;
}

export interface FullPathInfoModel extends Api.EditPathInfo {
    fileType: FileType;
}

export interface IFileShare {
    id?: string;
    path: string;
    owner: ContactInterface;
    name?: string | undefined;
    isFolder: boolean;
    isSharedWithMe: boolean;
    size?: number | undefined;
    lastModified?: number | undefined;
    permissions: SharePermissionInterface[];
}

export interface ShareContent extends PathInfoModel {
    // share:
}

export const rootDirectory = '/';
export const currentDirectory = ref<string>(rootDirectory);
export const currentDirectoryContent = ref<PathInfoModel[]>([]);
export const selectedPaths = ref<PathInfoModel[]>([]);
export const copiedFiles = ref<PathInfoModel[]>([]);
export const currentSort = ref('name');
export const currentSortDir = ref('asc');
export const searchDirValue = ref<string>('');
export const searchResults = ref<PathInfoModel[] | string>([]);
export const isDraggingFiles = ref<boolean>(false);
export const selectedAction = ref<Action>(Action.COPY);
export const sharedDir = ref(false);
export const sharedContent = ref<SharedFileInterface[]>([]);
export const areFilesInChatReceived = ref(false);
export const chatFiles = ref<File[]>();
export const allSharedContent = ref<SharedFileInterface[]>([]);
export const chatsWithFiles = ref<Chat[]>();
export const chatsWithAttachments = ref<String[]>();

export const fileBrowserTypeView = ref<string>('LIST');
export const accessDenied = ref(false);
export const chatFilesBreadcrumbs = ref([]);
export const savedAttachmentsBreadcrumbs = ref([]);

export const sharedItem = ref<FileShareMessageType>();
export const isQuantumChatFiles = ref<boolean>(false);

export const currentShare = ref<SharedFileInterface>(undefined);
export const selectedTab = ref(0);
export const savedAttachments = ref<boolean>(false);
export const savedAttachmentsIsLoading = ref<boolean>(false);
const { user } = useAuthState();

watch([currentDirectory], () => {
    updateContent();
    sharedDir.value = false;
    selectedPaths.value = [];
    searchResults.value = [];
    searchDirValue.value = '';
});

function pathJoin(parts, separator = '/'): string {
    const replace = new RegExp(separator + '{1,}', 'g');
    return parts.join(separator).replace(replace, separator);
}

export const getFile = async (fullPath: string): Promise<FullPathInfoModel> => {
    const result = await Api.getFileInfo(fullPath);
    if (result.status !== 200 || !result.data) throw new Error('Could not get file');

    return createModel(result.data) as FullPathInfoModel;
};

export const updateContent = async (path = currentDirectory.value) => {
    const result = await Api.getDirectoryContent(path);

    if (result.status !== 200 || !result.data) throw new Error('Could not get content');

    const { user } = useAuthState();
    currentDirectoryContent.value = result.data.map(createModel).filter(item => item.name !== user.id);

    savedAttachments.value = false;
};

export const updateAttachments = async (path = currentDirectory.value) => {
    savedAttachmentsIsLoading.value = true;
    const result = await Api.getDirectoryContent(path, true);
    if (result.status !== 200 || !result.data) throw new Error('Could not get content');

    currentDirectoryContent.value = result.data.map(createModel).filter(item => item.name !== user.id);
    savedAttachments.value = true;
    savedAttachmentsIsLoading.value = false;
    return result;
};

export const createDirectory = async (name: string, path = currentDirectory.value) => {
    const result = await Api.createDirectory(path, name);
    if ((result.status !== 200 && result.status !== 201) || !result.data)
        throw new Error('Could not create new folder');

    currentDirectoryContent.value.push(createModel(result.data));
    await updateContent();
};

export const uploadFiles = async (files: File[], path = currentDirectory.value) => {
    Promise.all(
        files.map(async (f): Promise<void> => {
            const result = await Api.uploadFile(path, f);
            if (!result || (result.status !== 200 && result.status !== 201) || !result.data)
                throw new Error('Could not create new folder');
            if (hasSpecialCharacters(f.name)) {
                createErrorNotification('Failed to upload file', 'No special characters allowed');
                return;
            }
            currentDirectoryContent.value.push(createModel(result.data));
            await updateContent();
        })
    );
};

const { chats } = useChatsState();

export const goToShared = async () => {
    sharedDir.value = true;
    selectedPaths.value = [];
    searchResults.value = [];
    searchDirValue.value = '';

    await router.push({ name: 'sharedWithMe' });
    await getSharedContent();
};

const resetForFilesReceivedInChat = () => {
    selectedPaths.value = [];
    searchResults.value = [];
    searchDirValue.value = '';
    chatsWithFiles.value = [];
    chatFiles.value = [];
    chatsWithAttachments.value = [];
};

export const goToFilesInChat = async (chat?: Chat) => {
    sharedFolderIsloading.value = true;
    const received = router.currentRoute.value.meta.received as boolean;

    if (chat) {
        router.push({
            name: received ? 'filesReceivedInChatNested' : 'filesSentInChatNested',
            params: {
                chatId: chat.chatId,
            },
        });
        chatFiles.value = await chatFilesReceived(chat, received);
        sharedFolderIsloading.value = false;
        chatFilesBreadcrumbs.value.push({ name: chat.chatId });
        return;
    }

    resetForFilesReceivedInChat();
    router.push({
        name: received ? 'filesReceivedInChat' : 'filesSentInChat',
    });

    chatsWithFiles.value = getchatsWithFiles(received);
};

export const fetchSharedInChatFiles = received => {
    resetForFilesReceivedInChat();
    sharedDir.value = true;
    chatsWithFiles.value = getchatsWithFiles(received);
    sharedFolderIsloading.value = false;
};

export const getFilesInChat = chat => {
    const files = chat.messages.filter((el: { type: MessageTypes }) => el.type === MessageTypes.FILE);
    return files.map((item: { body: { filename: any } }) => {
        return { ...item, fileType: getExtension(item.body.filename) };
    });
};

export const chatFilesReceived = (chat: Chat, received: boolean) => {
    const route = router.currentRoute.value;

    const currentChatFiles = getFilesInChat(chat);

    return received
        ? currentChatFiles.filter(el => el.from !== user.id)
        : currentChatFiles.filter(el => el.from === user.id);
};

export const getchatsWithFiles = (received: boolean) => {
    return chats.value.filter(chat => chatFilesReceived(chat, received).length > 0);
};

export const deleteFiles = async (list: PathInfoModel[]) => {
    await Promise.all(
        list.map(async f => {
            const result = await Api.deleteFile(f.path);
            if (result.status !== 200 && result.status !== 201) throw new Error('Could not delete file');
            selectedPaths.value = [];
            await updateContent();
        })
    );
};
export const downloadFiles = async () => {
    await Promise.all(
        selectedPaths.value.map(async f => {
            const result = await Api.downloadFile(f.path);
            if (result.status !== 200 && result.status !== 201) throw new Error('Could not download file');
            let itemName = f.fullName;
            if (f.isDirectory) itemName += '.zip';
            fileDownload(result.data, itemName);
            selectedPaths.value = [];
        })
    );
};

export const downloadFileForPreview = async (path: string) => {
    const response = await Api.downloadFile(path);
    const result = window.URL.createObjectURL(response.data);
    setImageSrc(result);
};

export const goToFolderInCurrentDirectory = (item: PathInfoModel, attachment: boolean = false) => {
    const currentPath = item.path;
    if (savedAttachments.value) {
        router.push({
            name: 'savedAttachments',
            params: {
                path: btoa(currentPath),
            },
        });
    } else {
        router.push({
            name: 'quantumFolder',
            params: {
                folder: btoa(currentPath),
            },
        });
    }
    currentDirectory.value = currentPath;
};

export const goToHome = () => {
    sharedDir.value = false;
    currentShare.value = undefined;

    router.push({
        name: AppType.Quantum,
        params: {
            path: btoa('/'),
        },
    });
    currentDirectory.value = rootDirectory;
};

export const moveFiles = async (destination: string, items = selectedPaths.value.map(x => x.path)) => {
    if (items.includes(destination)) {
        createErrorNotification('Error while moving', 'Unable to move into itself');
        return;
    }

    const result = await Api.moveFiles(items, destination);
    if (result.status !== 200 && result.status !== 201) {
        createErrorNotification('Error while moving', 'Something went wrong');
        return;
    }

    createNotification('Move Successful', `Moved ${items.length} item(s) into ${destination}`, Status.Success);
    await updateContent();
};

export const copyPasteSelected = async () => {
    //copy
    if (copiedFiles.value.length === 0) {
        copiedFiles.value = selectedPaths.value;
        selectedPaths.value = [];
        return;
    }

    //paste
    if (selectedAction.value === Action.COPY) {
        const result = await Api.copyFiles(
            copiedFiles.value.map(x => x.path),
            currentDirectory.value
        );
        if (result.status !== 200 && result.status !== 201) throw new Error('Could not copy files');
    }
    //paste/cut
    if (selectedAction.value === Action.CUT) {
        await moveFiles(
            currentDirectory.value,
            copiedFiles.value.map(x => x.path)
        );
    }
    await clearClipboard();
    await updateContent();
};

export const clearClipboard = () => {
    copiedFiles.value = [];
    selectedPaths.value = [];
};

export const searchDir = async () => {
    if (sharedDir.value) {
        await getSharedContent();
        sharedContent.value = sharedContent.value.filter(
            x => searchDirValue.value === '' || x.name.includes(searchDirValue.value)
        );
        return;
    }

    const result = await Api.searchDir(searchDirValue.value, currentDirectory.value);

    if (result.status !== 200 || !result.data) throw new Error('Could not get search results');
    if (searchDirValue.value === '') {
        searchResults.value = [];
        return;
    }
    if (result.data.length <= 0) {
        searchResults.value = 'None';
        return;
    }
    searchResults.value = result.data.map(createModel).filter(item => {
        const configPath = `/appdata/storage/${user.id}`;
        return !item.path.startsWith(configPath);
    });
};

export const renameFile = async (item: PathInfoModel, name: string) => {
    const characterLimit = 50;
    if (!name || name.length === 0 || name.length > characterLimit) {
        createNotification(
            'Failed to rename file',
            `Filename cannot be empty or longer than ${characterLimit} characters`,
            Status.Error
        );
        return;
    }
    if (hasSpecialCharacters(name)) {
        createNotification('Failed to rename file', 'No special characters allowed', Status.Error);
        return;
    }
    const oldPath = item.path;
    let newPath = pathJoin([currentDirectory.value, name]);
    if (item.extension) newPath = pathJoin([currentDirectory.value, `${name}.${item.extension}`]);

    const result = await Api.renameFile(oldPath, newPath);
    if (result.status !== 200 && result.status !== 201) throw new Error('Could not rename file');

    selectedPaths.value = [];
    await updateContent();
};

export const goToAPreviousDirectory = (index: number) => {
    if (sharedDir.value === true) {
        sharedDir.value = false;
        return;
    }
    if (currentDirectory.value === rootDirectory) return;
    const parts = currentDirectory.value.split('/');
    if (index < 1 || index === parts.length - 1) return;
    parts.splice(index + 1);
    currentDirectory.value = pathJoin(parts);
};

export const goToFileDirectory = (item: PathInfoModel) => {
    const itemDir = item.path.substr(0, item.path.lastIndexOf('/'));
    if (item.isDirectory) {
        currentDirectory.value = item.path;
        return;
    }
    if (currentDirectory.value === itemDir) {
        searchResults.value = [];
        searchDirValue.value = '';
        return;
    }
    currentDirectory.value = itemDir;
};

export const goBack = () => {
    if (sharedDir.value) {
        sharedDir.value = false;
        return;
    }
    if (currentDirectory.value === rootDirectory) return;
    const parts = currentDirectory.value.split('/');
    parts.pop();
    parts.length === 1 ? (currentDirectory.value = rootDirectory) : (currentDirectory.value = pathJoin(parts));
};

export const selectItem = (item: PathInfoModel) => {
    selectedPaths.value.push(item);
};

export const deselectItem = (item: PathInfoModel) => {
    selectedPaths.value = selectedPaths.value.filter(x => !equals(x, item));
};

export const equals = (item1: PathInfoModel, item2: PathInfoModel): boolean => {
    if (!item1 || !item2) return false;
    return (
        item1.fullName === item2.fullName &&
        item1.isDirectory === item2.isDirectory &&
        item1.extension === item2.extension &&
        item1.path === item2.path
    );
};

export const selectAll = () => {
    selectedPaths.value = [...currentDirectoryContent.value];
};

export const deselectAll = () => {
    selectedPaths.value = [];
};

export const handleAllSelect = (checked: boolean) => {
    if (checked) {
        selectAll();
        return;
    }
    deselectAll();
};

export const truncatePath = str => {
    if (str.length > 30) {
        return str.substr(0, 20) + '...' + str.substr(-30);
    }
    return str;
};

export const isSelected = (item: PathInfoModel) => {
    return selectedPaths.value.includes(item);
};

export const itemAction = async (item: PathInfoModel) => {
    if (item.isDirectory) {
        goToFolderInCurrentDirectory(item);
        return;
    }

    if (isMobile()) {
        createNotification('Not supported on mobile', 'This type of file is not supported on mobile.');
        return;
    }

    const result = router.resolve({
        name: 'editFile',
        params: { path: btoa(item.path), attachments: String(savedAttachments.value) },
    });

    window.open(result.href, '_blank', 'noreferrer');
};

export const sortContent = () => {
    return currentDirectoryContent.value.sort((a, b) => {
        let modifier = 1;

        if (currentSortDir.value === 'desc') modifier = -1;
        if (currentSort.value === 'name') {
            if (!a.isDirectory && b.isDirectory) return 1;
            if (a.isDirectory && !b.isDirectory) return -1;
        }

        if (a[currentSort.value] < b[currentSort.value]) return -1 * modifier;
        if (a[currentSort.value] > b[currentSort.value]) return 1 * modifier;
        return 0;
    });
};

export const sortAction = function (s) {
    if (s === currentSort.value) {
        currentSortDir.value = currentSortDir.value === 'asc' ? 'desc' : 'asc';
    }
    currentSort.value = s;
};

export const getIcon = (isDirectory: boolean, fileType: FileType) => {
    if (isDirectory) return 'fas fa-folder';

    const fileIcons = Object.values(FileType);
    const toBeFiltered = [FileType.Text, FileType.Html, FileType.Unknown];
    const filteredFileIcons = fileIcons.filter(f => !toBeFiltered.includes(f));

    if (filteredFileIcons.includes(fileType)) return `far fa-file-${fileType}`;
    return 'far fa-file';
};

export const createModel = <T extends Api.PathInfo>(pathInfo: T): PathInfoModel => {
    return {
        ...pathInfo,
        fileType: pathInfo.isDirectory ? FileType.Unknown : getFileType(pathInfo.extension?.toLowerCase()),
    };
};

export const getFileType = (extension: string): FileType => {
    switch (extension?.toLowerCase()) {
        case 'webm':
        case 'mpg':
        case 'mpeg':
        case 'mp4':
        case 'avi':
        case 'wmv':
        case 'flv':
        case 'mov':
        case 'swf':
            return FileType.Video;
        case 'doc':
            return FileType.Word;
        case 'docm':
        case 'docx':
        case 'dot':
        case 'dotm':
        case 'dotx':
            return FileType.Word;
        case 'jpg':
            return FileType.Image;
        case 'jpeg':
            return FileType.Image;
        case 'tiff':
        case 'txt':
            return FileType.Text;
        case 'png':
            return FileType.Image;
        case 'bmp':
        case 'gif':
            return FileType.Image;
        case 'webp':
        case 'svg':
            return FileType.Image;
        case 'pdf':
            return FileType.Pdf;
        case 'csv':
            return FileType.Csv;
        case 'm4a':
        case 'flac':
        case 'mp3':
        case 'wav':
        case 'wma':
        case 'aac':
            return FileType.Audio;
        case '7z':
        case 'tar.bz2':
        case 'bz2':
        case 'tar.gz':
        case 'zip':
        case 'zipx':
        case 'gz':
        case 'rar':
            return FileType.Archive;
        case 'xlsx':
        case 'xlsm':
        case 'xlsb':
        case 'xltx':
        case 'xltm':
        case 'xls':
        case 'xlt':
        case 'xla':
        case 'xlw':
        case 'xlr':
        case 'xlam':
            return FileType.Excel;
        case 'potm':
        case 'ppa':
        case 'ppam':
        case 'pps':
        case 'ppsm':
        case 'ppsx':
        case 'pptm':
        case 'ods':
            return FileType.Excel;
        case 'odt':
            return FileType.Word;
        case 'odp':
        case 'ppt':
        case 'pptx':
            return FileType.Powerpoint;
        case 'html':
            return FileType.Html;
        default:
            return FileType.Unknown;
    }
};

export const getFileSize = (val: any) => {
    if (val.extension) {
        return formatBytes(val.size, 2);
    }
    return '-';
};
export const formatBytes = function (bytes, decimals) {
    if (bytes == 0) return '0 Bytes';
    let k = 1024,
        dm = decimals || 2,
        sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
        i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};
export const getFileExtension = (val: any) => {
    if (val.extension) {
        return val.extension;
    }
    return '-';
};
export const getFileLastModified = (val: any) => {
    const dateObj = new Date(val.lastModified);
    const dd = dateObj.getDate();
    const mm = dateObj.getMonth() + 1;
    const yyyy = dateObj.getFullYear();
    if (moment.duration(moment().startOf('day').diff(dateObj)).asDays() < -7) {
        return dd + '-' + mm + '-' + yyyy;
    }
    return moment(dateObj).fromNow();
};

export const getIconColor = (isDirectory: boolean, fileType: FileType) => {
    if (isDirectory) return 'text-primary';
    switch (fileType) {
        case FileType.Excel:
            return 'text-green-400';
        case FileType.Word:
            return 'text-blue-400';
        case FileType.Powerpoint:
            return 'text-red-400';
        default:
            return 'text-primarylight';
    }
};

export const getSharedContent = async () => {
    const result = await Api.getShared('SharedWithMe');
    sharedContent.value = result.data;
    allSharedContent.value = result.data;
};

export const sharedBreadcrumbs = ref([]);

export const clickBreadcrumb = async (item, breadcrumbs, idx) => {
    //This function only applies in your 'shared with me' folders
    resetSharedFolder();

    if (idx === 0) {
        //Go to shared with me folder
        router.push({
            name: 'sharedWithMe',
        });
        return;
    }
    if (idx === 1) {
        //If clicked on the first breadcrumb, go to root shared folder
        router.push({
            name: 'sharedWithMeItem',
            params: {
                sharedId: breadcrumbs[1].id,
            },
        });
        return;
    }

    const params = router.currentRoute.value.params;
    let splitter = String(params.path).split('/').slice(0);
    //Deleting all empty values
    splitter = splitter.filter(function (element) {
        return element !== '';
    });

    const newPath = splitter.slice(0, idx - 1);

    router.push({
        name: 'sharedWithMeItemNested',
        params: {
            sharedId: params.sharedId,
            path: `/${newPath.join('/')}`,
        },
    });
};

export const sharedFolderIsloading = ref(false);

const resetSharedFolder = () => {
    sharedDir.value = true;
    selectedPaths.value = [];
    searchResults.value = [];
    searchDirValue.value = '';
};

//This timer is used for if a folder has been trying to load for too long.
//If it takes too long => redirect to sharedwithme page
let timer;

function startTimer(milliseconds) {
    timer = setTimeout(function () {
        router.push({ name: 'sharedWithMe' });
        showSharedFolderErrorModal.value = true;
    }, milliseconds);
}

export function stopTimer() {
    clearTimeout(timer);
}

//Error dialog
export const showSharedFolderErrorModal = ref(false);

export const loadLocalFolder = () => {
    if (router.currentRoute.value.params.attachment) updateAttachments(currentDirectory.value);
    const folderId = decodeString(<string>router.currentRoute.value.params.folder);
    currentDirectory.value = folderId.split('.').shift();
    savedAttachments.value = false;
};

export const fetchBasedOnRoute = async () => {
    const route = router.currentRoute.value;
    //Starting lazy loader animation
    sharedFolderIsloading.value = true;

    if (route.name === 'quantum') {
        await getSharedContent();
        sharedFolderIsloading.value = false;
        return;
    }

    if (route.meta.root_parent === 'quantum') {
        await getSharedContent();
        sharedFolderIsloading.value = true;
    }

    if (route.name === 'sharedWithMe') {
        resetSharedFolder();
        sharedFolderIsloading.value = false;

        return;
    }
    if (route.name === 'filesReceivedInChat') {
        resetSharedFolder();
        sharedFolderIsloading.value = false;
        allSharedContent.value = [];
        sharedContent.value = [];

        return;
    }
    if (route.name === 'savedAttachments') {
        resetSharedFolder();
        sharedFolderIsloading.value = false;
        allSharedContent.value = [];
        sharedContent.value = [];
        savedAttachments.value = true;

        return;
    }

    if (route.name === 'sharedWithMeItem') {
        const parent = allSharedContent.value.find(x => x.id === route.params.sharedId);
        if (!parent) {
            router.push({ name: 'sharedWithMe' });
            sharedFolderIsloading.value = false;
            return;
        }
        //Starting timer
        if (sharedFolderIsloading.value) {
            startTimer(5000);
        }

        //Fetching items
        const items = await getSharedFolderContent(parent.owner, parent.id, '/');
        //If there is something wrong with downloading the folder, return to shared with me.
        stopTimer();

        sharedContent.value = items.map(item => {
            let itemName = item.name;
            if (item.extension) {
                itemName = itemName + '.' + item.extension;
            }
            return <SharedFileInterface>{
                id: parent.id,
                path: item.path,
                owner: parent.owner,
                name: itemName,
                isFolder: item.isDirectory,
                size: item.size,
                lastModified: item.lastModified.getTime ? item.lastModified.getTime() : undefined,
                permissions: parent.permissions,
            };
        });
        sharedDir.value = true;
        sharedFolderIsloading.value = false;
        return;
    }
    if (route.name === 'sharedWithMeItemNested') {
        //await getSharedContent();

        const parent = allSharedContent.value.find(x => x.id === route.params.sharedId);
        if (!parent) {
            router.push({ name: 'sharedWithMe' });

            sharedFolderIsloading.value = false;
            return;
        }

        if (!isArray(route.params.path)) {
            const folderTree = route.params.path.split('/');

            const items = await getSharedFolderContent(
                parent.owner,
                parent.id,
                '/' + `/${folderTree.slice(1).join('/')}`
            );

            sharedContent.value = items.map(item => {
                let itemName = item.name;
                if (item.extension) {
                    itemName = itemName + '.' + item.extension;
                }
                return <SharedFileInterface>{
                    id: parent.id,
                    path: item.path,
                    owner: parent.owner,
                    name: itemName,
                    isFolder: item.isDirectory,
                    size: item.size,
                    lastModified: item.lastModified.getTime ? item.lastModified.getTime() : undefined,
                    permissions: parent.permissions,
                };
            });
            sharedDir.value = true;
            sharedFolderIsloading.value = false;
        }
    }
};

export const sharedWithMeCurrentFolder = ref<string>('');

export const loadSharedItems = () => {
    sharedBreadcrumbs.value = [{ name: 'Shared with me' }];

    const params = router.currentRoute.value.params;

    if (params.sharedId) {
        const firstNode = allSharedContent.value.find(item => item.id === params.sharedId);
        sharedBreadcrumbs.value.push(firstNode);

        if (!firstNode) router.push({ name: 'sharedWithMe' });
    }

    if (params.path && params.sharedId) {
        const decoded = params.path;

        if (!Array.isArray(params.path)) {
            const history = params.path.split('/');
            history.forEach(element => {
                if (element !== '') sharedBreadcrumbs.value.push({ name: element });
            });
        }
    }

    sharedWithMeCurrentFolder.value = sharedBreadcrumbs.value[sharedBreadcrumbs.value.length - 1];
};

export const goIntoSharedFolder = async (share: SharedFileInterface) => {
    if (router.currentRoute.value.params.sharedId) {
        if (router.currentRoute.value.params.path) {
            router.push({
                name: 'sharedWithMeItemNested',
                params: {
                    sharedId: router.currentRoute.value.params.sharedId,
                    path: share.path,
                },
            });
            return;
        }
        router.push({
            name: 'sharedWithMeItemNested',
            params: {
                sharedId: router.currentRoute.value.params.sharedId,
                path: share.path,
            },
        });
    } else {
        router.push({
            name: 'sharedWithMeItem',
            params: {
                sharedId: share.id,
            },
        });
    }
};

export const goToExternalOnlyOffice = (item: SharedFileInterface) => {
    if (item.isFolder) {
        goIntoSharedFolder(item);
        return;
    }
    const url = router.resolve({
        name: 'editFile',
        params: {
            path: btoa(item.path),
            shareId: item.id,
            attachments: 'false',
        },
    });
    window.open(url.href, '_blank');
};

export const goToOwnOnlyOffice = () => {
    const url = router.resolve({
        name: 'editFile',
        params: {
            path: btoa(sharedItem.value.path),
            shareId: '',
            attachments: 'false',
        },
    });
    window.open(url.href, '_blank');
};

export const addShare = async (userId: string, path: string, filename: string, size: number, writable) => {
    return (await Api.addShare(userId, path, filename, size, writable)).data;
};

export const parseJwt = token => {
    let base64Url = token.split('.')[1];
    return JSON.parse(Buffer.from(base64Url, 'base64').toString());
};

export const getExtension = filename => {
    return filename?.substring(filename.lastIndexOf('.') + 1);
};

export const fetchShareDetails = async (shareId: string) => {
    const shareDetails = await getShareWithId(shareId);
    return shareDetails;
};

export const fetchFileAccessDetails = async (
    owner: ContactInterface,
    shareId: string,
    path: string,
    attachments: boolean
) => {
    const { user } = useAuthState();
    const fileAccessDetails = await Api.getFileAccessDetails(owner, shareId, <string>user.id, path, attachments);
    return fileAccessDetails;
};

export const getExternalPathInfo = async (digitalTwinId: string, token: string, shareId: string) => {
    let params = { shareId: shareId, token: token };
    const locationApiEndpoint = `/api/v2/quantum/file/info?params=${btoa(JSON.stringify(params))}`;
    let location = '';
    if (digitalTwinId == user.id) {
        location = `${config.baseUrl}${locationApiEndpoint}`;
    } else {
        location = calcExternalResourceLink(
            `http://[${watchingUsers[<string>digitalTwinId].location}]${locationApiEndpoint}`
        );
    }
    // TODO: url encoding
    const response = await axios.get(location);
    return response.data;
};

export const getSharedFolderContent = async (owner, shareId, path: string = '/') => {
    const { user } = useAuthState();

    return await Api.getSharedFolderContent(owner, shareId, <string>user.id, path);
};

export const isMobile = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

export const getMsgUrl = (body: MessageBodyType | SharedFileInterface) => {
    if (isMessageBodyType(body)) return body.url;

    const ownerLocation = body.owner.location;
    let path = body.path.replace('/appdata/storage/', '');
    return `http://[${ownerLocation}]/api/v2/files/${btoa(path)}`;
};

const isMessageBodyType = (body: MessageBodyType | SharedFileInterface): body is MessageBodyType => {
    return !!(body as MessageBodyType).url;
};
