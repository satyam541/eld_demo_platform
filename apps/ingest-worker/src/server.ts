import net from 'node:net';
import http from 'node:http';
import { env } from './env.js';
import { logger } from './logger.js';
import { CsvLineFramer, parseCsvPacket, PacketParseError } from './parser.js';
import { persistPacket } from './persistence.js';
import { publishLiveLocation } from './realtime.js';
import { GeometrisCsvPacketSchema } from '@eld/shared/schemas';

interface ConnState {
  framer: CsvLineFramer;
  remote: string;
  lastActivity: number;
  packetsRx: number;
}

const conns = new Map<net.Socket, ConnState>();

function isAllowed(remote: string): boolean {
  if (!env.ALLOWED_SOURCES) return true;
  const allow = env.ALLOWED_SOURCES.split(',').map((s) => s.trim());
  return allow.some((a) => remote === a || remote.startsWith(a));
}

async function handleLine(line: string, remote: string): Promise<void> {
  let parsed;
  try {
    parsed = parseCsvPacket(line);
  } catch (e) {
    if (e instanceof PacketParseError) {
      logger.warn({ remote, line, err: e.message }, 'parse error');
    } else {
      logger.error({ remote, line, err: e }, 'unexpected parse failure');
    }
    return;
  }

  const validation = GeometrisCsvPacketSchema.safeParse(parsed);
  if (!validation.success) {
    logger.warn(
      { remote, issues: validation.error.issues, line },
      'schema validation failed'
    );
    return;
  }
  const packet = validation.data;

  try {
    const meta = await persistPacket(packet);
    logger.info(
      {
        sn: packet.serialNumber,
        reason: packet.reasonText ?? packet.reasonCode,
        lat: packet.latitude,
        lon: packet.longitude,
        speed: packet.speedMph,
      },
      'packet stored'
    );

    if (packet.latitude !== null && packet.longitude !== null) {
      await publishLiveLocation(meta.fleetId, {
        deviceSerial: packet.serialNumber,
        vehicleId: meta.vehicleId,
        lat: packet.latitude,
        lon: packet.longitude,
        speedMph: packet.speedMph,
        heading: packet.heading,
        ignition: packet.ignition,
        reason: packet.reasonText,
        ts: new Date(packet.eventUnixTime * 1000).toISOString(),
      });
    }
  } catch (err) {
    logger.error({ err, sn: packet.serialNumber }, 'persistence failed');
  }
}

const tcpServer = net.createServer((socket) => {
  const remote = `${socket.remoteAddress}:${socket.remotePort}`;
  if (!isAllowed(socket.remoteAddress ?? '')) {
    logger.warn({ remote }, 'connection rejected by ALLOWED_SOURCES');
    socket.destroy();
    return;
  }
  logger.info({ remote }, 'device connected');
  socket.setKeepAlive(true, 60_000);
  socket.setTimeout(env.IDLE_TIMEOUT_SEC * 1000);

  const state: ConnState = {
    framer: new CsvLineFramer(),
    remote,
    lastActivity: Date.now(),
    packetsRx: 0,
  };
  conns.set(socket, state);

  socket.on('data', (chunk) => {
    state.lastActivity = Date.now();
    const lines = state.framer.feed(chunk);
    for (const line of lines) {
      state.packetsRx++;
      void handleLine(line, remote);
    }
  });

  socket.on('timeout', () => {
    logger.info({ remote }, 'idle timeout');
    socket.end();
  });

  socket.on('error', (err) => {
    logger.warn({ remote, err: err.message }, 'socket error');
  });

  socket.on('close', () => {
    const s = conns.get(socket);
    logger.info(
      { remote, packetsRx: s?.packetsRx ?? 0 },
      'device disconnected'
    );
    conns.delete(socket);
  });
});

tcpServer.on('error', (err) => {
  logger.error({ err }, 'tcp server error');
});

tcpServer.listen(env.INGEST_TCP_PORT, () => {
  logger.info(
    { port: env.INGEST_TCP_PORT },
    'Geometris CSV ingest listening on TCP'
  );
});

// ── Health endpoint ─────────────────────────────────────────────────────
const healthServer = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        connections: conns.size,
        uptime: process.uptime(),
      })
    );
    return;
  }
  res.writeHead(404);
  res.end();
});

healthServer.listen(env.HEALTH_HTTP_PORT, () => {
  logger.info(
    { port: env.HEALTH_HTTP_PORT },
    'health endpoint listening on HTTP'
  );
});

// ── Graceful shutdown ───────────────────────────────────────────────────
function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  tcpServer.close();
  healthServer.close();
  for (const sock of conns.keys()) sock.end();
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
