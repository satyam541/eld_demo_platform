import Pusher from 'pusher';
import { channels, type LiveLocationEvent } from '@eld/shared/schemas';
import { env } from './env.js';
import { logger } from './logger.js';

const url = new URL(env.SOKETI_HOST);

export const pusher = new Pusher({
  appId: env.SOKETI_APP_ID,
  key: env.SOKETI_APP_KEY,
  secret: env.SOKETI_APP_SECRET,
  host: url.hostname,
  port: url.port || (url.protocol === 'https:' ? '443' : '80'),
  useTLS: url.protocol === 'https:',
});

export async function publishLiveLocation(
  fleetId: string,
  evt: LiveLocationEvent
): Promise<void> {
  try {
    await pusher.trigger(channels.fleetLocations(fleetId), 'location', evt);
  } catch (err) {
    logger.warn({ err }, 'failed to publish to Soketi (non-fatal)');
  }
}
