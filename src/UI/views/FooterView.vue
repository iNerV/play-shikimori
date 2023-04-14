<template>
    <v-app id="app">
        <v-container class="flex" id="page-content">
            <transition appear mode="out-in" name="fade-transition">
                <router-view></router-view>
            </transition>
        </v-container>
        <messages></messages>
    </v-app>

</template>

<script lang="ts">
    import Messages from '@/UI/components/messages.vue';
    import {Component, Vue} from 'vue-property-decorator';

    @Component({
        name: 'footer-template',
        components: {
            Messages,
        },
    })
    export default class FooterTemplate extends Vue {
    }
</script>
