import { ref } from 'vue';

export const blocklist = ref([]);

// export const initBlocklist = async () => {
//     try {
//         const axiosResponse = await axios.get(`${config.baseUrl}api/v1/blocked`);
//         blocklist.value = axiosResponse.data;
//     } catch (e) {
//         console.log('could not get blocklist');
//     }
// };

export const addUserToBlockList = (userId: string) => {
    blocklist.value.push(userId);
};

export const isBlocked = (userId: string) => blocklist.value.includes(userId);

// export const deleteBlockedEntry = async (user: string) => {
//     await axios.delete(`${config.baseUrl}api/v1/blocked/${user}/`);
//     blocklist.value = blocklist.value.filter(x => x !== user);
// };
