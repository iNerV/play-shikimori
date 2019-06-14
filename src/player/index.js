// import devtools from '@vue/devtools'
// if (process.env.NODE_ENV === 'development') {
//   devtools.connect(/* host, port */)
// }

import Vue from 'vue';
import Vuetify from 'vuetify'
import store from './store/index.js'
import App from './components/App.vue';
import VueAnalytics from 'vue-analytics'
import { page } from 'vue-analytics'

Vue.use(Vuetify)
Vue.use(page)

Vue.use(VueAnalytics, {
  id: 'UA-71609511-7',
  autoTracking: {
    pageviewOnLoad: false,
    // exception: true,
    // exceptionLogs: process.env.NODE_ENV === 'development'
  },
  set: [
    { field: 'checkProtocolTask', value: function () { } }
  ],
  debug: {
    enabled: process.env.NODE_ENV === 'development'
  },
  pageviewTemplate(route) {
    console.log({ route })

  }
})

const app = new Vue({
  render: h => h(App),
  store,
});

app.$mount('app');