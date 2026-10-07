export function errorHandler(error, _req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599
    ? error.status
    : 500;

  let message = 'Internal server error.';

  if (status === 404) message = 'Route not found.';
  else if (error.type === 'entity.parse.failed') message = 'Invalid JSON body.';
  else if (status < 500) message = 'Invalid request.';

  if (status >= 500) console.error(error);

  res.status(status).json({ message });
}
