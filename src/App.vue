<template>
  <div id="app">
    <UploadFragment @success="uploadSuccess" />
  </div>
</template>

<script>
import UploadFragment from './components/UploadFragment.vue'

export default {
  name: 'App',
  components: {
    UploadFragment
  },
  methods: {
    uploadSuccess(res) {
      console.log('---uploadSuccess', res)
    }
  }
}
</script>

<style>
body{
  margin: 0;
}
#app {
  height: 100vh;
  display: grid;
  place-items: center;
}
</style>
