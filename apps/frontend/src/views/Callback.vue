<template>
    <div>
        <h2>Redirecting you to your digitaltwin.</h2>
    </div>
</template>

<script lang="ts" setup>
    import { useRouter } from 'vue-router';
    import { getMe, useAuthState } from '@/store/authStore';
    import config from '@/config';

    const { user } = useAuthState();

    const router = useRouter();

    const init = async () => {
        const profile = await getMe();

        if (!profile.username) await router.push('error');

        user.id = profile.username;
        user.email = profile.email;
        user.image = `${config.baseUrl}/api/v2/user/avatar`;
    };

    init();

    router.push('/dashboard');
</script>
