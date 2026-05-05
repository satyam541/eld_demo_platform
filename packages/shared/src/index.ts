export * from './schemas/index.js';

export const TOPIC_LOCATION = (imei: string) => `fleet/${imei}/location`;
export const TOPIC_EVENT = (imei: string) => `fleet/${imei}/event`;
export const TOPIC_OBD = (imei: string) => `fleet/${imei}/obd`;
export const TOPIC_COMMAND = (imei: string) => `cmd/${imei}`;
