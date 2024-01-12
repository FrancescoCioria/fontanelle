module.exports = config => ({
  ...config,
  resolve: {
    ...config.resolve,
    fallback: {
      ...config.resolve?.fallback,
      timers: require.resolve("timers-browserify"),
      buffer: require.resolve("buffer/"),
      stream: require.resolve("stream-browserify")
    }
  }
});
