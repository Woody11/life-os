// Wraps an async Express handler so rejected promises reach next(err) instead
// of becoming unhandled rejections that never respond to the client.
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { asyncHandler };
