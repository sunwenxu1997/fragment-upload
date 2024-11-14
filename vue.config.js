const target = 'https://kfscrmdev.opple.com';

module.exports = {
  assetsDir: 'static',
  devServer: {
    proxy: {
      '/opple/': {
        target,
        secure: false,
        changeOrigin: true
      }
    }
  }
};
