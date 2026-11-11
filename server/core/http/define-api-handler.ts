import { defineEventHandler, type EventHandlerRequest, type H3Event } from 'h3'
import { toHttpError } from '../errors/to-http-error'

/** Wraps a controller so whatever it throws reaches the client in the standard error shape. */
export const defineApiHandler = <T>(handler: (event: H3Event<EventHandlerRequest>) => T | Promise<T>) =>
  defineEventHandler(async (event) => {
    try {
      return await handler(event)
    } catch (err) {
      throw toHttpError(err, event.context.requestId)
    }
  })
