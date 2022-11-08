function getPublicPath() {
  switch (process.env.NODE_ENV) {
    case 'production': return '/'
    case 'stage': return '/momo-store/'
    default: return '/'
  }
}

module.exports = {
  devServer: {
    disableHostCheck: true
  },
  publicPath: getPublicPath()
  // publicPath: process.env.NODE_ENV === 'production'
  //   ? '/'
  //   : '/momo-store/'
};