import Vue from 'vue'
import App from './App.vue'
import ElementUI from 'element-ui';
import 'element-ui/lib/theme-chalk/index.css';
import http from './utils/http'
Vue.use(ElementUI, { size: 'small' });
Vue.prototype.$http = http

Vue.config.productionTip = false

new Vue({
  render: h => h(App),
}).$mount('#app')
