const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);

  let errorResponse = {
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  };

  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    res.status(404);
    errorResponse.message = 'Resource not found';
  }

  if (err.name === 'ValidationError') {
    res.status(400);
    errorResponse.message = 'Invalid input data';
    errorResponse.errors = Object.values(err.errors).map(e => e.message);
  }

  res.json(errorResponse);
};

module.exports = { errorHandler };
