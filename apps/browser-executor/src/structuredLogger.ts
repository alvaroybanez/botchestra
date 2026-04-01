type LogData = Record<string, unknown>;

function toErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      error: error.message,
      stack: error.stack,
    };
  }

  return {
    error: String(error),
    stack: undefined,
  };
}

export function getErrorMessage(error: unknown) {
  return toErrorDetails(error).error;
}

export function truncateForLog(value: string, maxLength = 500) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

export function logStructured(event: string, runId: string, data: LogData = {}) {
  console.log(JSON.stringify({ event, runId, ...data }));
}

export function logStructuredError(
  event: string,
  runId: string,
  error: unknown,
  data: LogData = {},
) {
  console.error(JSON.stringify({ event, runId, ...data, ...toErrorDetails(error) }));
}
