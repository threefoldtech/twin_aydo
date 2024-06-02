<template>
    <div
        :class="{
            'debug-screens': isDev,
        }"
        class="h-screen"
    >
        <router-view v-show="path !== '/glass'" />

        <app-layout>
            <div
                v-if="route.name !== 'editFile'"
                v-show="path === '/glass' && hasBrowserBeenStartedOnce"
                class="h-full"
            >
                <iframe
                    class="relative h-full w-full"
                    title="forum"
                    id="forum-iframe"
                    src="https://browser-v3.jimber.io/#https://duckduckgo.com/"
                    allow="geolocation; microphone; camera; encrypted-media; clipboard-read; clipboard-write;"
                />
            </div>
        </app-layout>
        <div
            v-if="isDev && user.location"
            class="fixed text-white bg-black -right-px -bottom-0.5 border border-white px-2 text-xs"
        >
            {{ user.location }}
        </div>
    </div>
</template>

<script lang="ts" setup>
    import AppLayout from './layout/AppLayout.vue';
    import version from '../public/config/version';
    import { getMe, useAuthState } from '@/store/authStore';
    import { computed, onBeforeMount } from 'vue';
    import { useRoute } from 'vue-router';
    import { hasBrowserBeenStartedOnce } from '@/store/browserStore';
    import { useSocketActions } from '@/store/socketStore';
    import { initBlocklist } from '@/store/blockStore';
    import { sendIdentifierToBackend } from '@/services/firebaseService';
    import { bypassAuth, bypassEndpoint } from './constants';

    const { user } = useAuthState();
    const { initializeSocket } = useSocketActions();

    onBeforeMount(async () => {
        if (user) {
            initializeSocket(user.id.toString());
            await initBlocklist();
        }

        const profile = await getMe();

        console.log('This is the users profile');
        console.log(profile);

        if (profile.username) {
            user.id = profile.username;
            user.email = profile.email;
            user.image = `${bypassAuth ? bypassEndpoint : window.location.origin}/api/v2/user/avatar`;

            await sendIdentifierToBackend();
        }
    });

    console.log('Version: ' + version);

    document.querySelector('body').classList.add('overflow-y-hidden');

    const isDev = import.meta.env.DEV || process.env.NODE_ENV === 'staging';

    const route = useRoute();
    const path = computed(() => route.path);
</script>
