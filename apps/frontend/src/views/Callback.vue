<template>
    <div>
        <h2>Redirecting you to your digitaltwin.</h2>
    </div>
</template>

<script lang="ts" setup>
    import { useRouter } from 'vue-router';
    import { getMe, useAuthState } from '@/store/authStore';
    import { bypassAuth, bypassEndpoint } from '@/constants';

    const { user } = useAuthState();

    const router = useRouter();

    const init = async () => {
        const profile = await getMe();

        if (!profile.username) await router.push('error');

        user.id = profile.username;
        user.email = profile.email;
        user.image = `${bypassAuth ? bypassEndpoint : window.location.origin}/api/v2/user/avatar`;
    };

    init();

    router.push('/dashboard');
</script>
