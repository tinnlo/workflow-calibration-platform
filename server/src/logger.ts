import pino from 'pino'
import { config } from '@/config.js'

export const loggerConfig: pino.LoggerOptions = {
  name: 'workflow-calibration-api',
  level: config.NODE_ENV === 'production' ? 'info' : 'debug',
  ...(config.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        ignore: 'pid,hostname',
        translateTime: 'yyyy-mm-dd HH:MM:ss.l',
      },
    },
  }),
  formatters: {
    level(label) {
      return { level: label } as object
    },
  },
  serializers: {
    req: (req: { method: string; url: string; headers: Record<string, string> }) => ({
      method: req.method,
      url: req.url,
      headers: {
        'user-agent': req.headers['user-agent'],
        'x-correlation-id': req.headers['x-correlation-id'],
        authorization: req.headers['authorization'] ? '[REDACTED]' : undefined,
      },
    }),
    res: (res: { statusCode: number; headers: Record<string, string> }) => ({
      statusCode: res.statusCode,
      'content-type': res.headers['content-type'],
    }),
    err: pino.stdSerializers.err,
  },
}

export const logger = pino(loggerConfig)
