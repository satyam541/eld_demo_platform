import { describe, it, expect } from 'vitest';
import { parseCsvPacket, CsvLineFramer, PacketParseError } from './parser.js';

const SAMPLE =
  'F001,81A161260005,IGN_OFF,1492711944,29.85657,-95.64319,77,0,0,114,0,0,32376.1,7,,35198,10449,,,,32372.0T,1N4AL3AP3GN360245,,0:0,,,,';

describe('parseCsvPacket (default param 12)', () => {
  it('decodes the documented sample packet', () => {
    const p = parseCsvPacket(SAMPLE);
    expect(p.formatCrc).toBe('F001');
    expect(p.serialNumber).toBe('81A161260005');
    expect(p.reasonText).toBe('IGN_OFF');
    expect(p.eventUnixTime).toBe(1492711944);
    expect(p.latitude).toBeCloseTo(29.85657);
    expect(p.longitude).toBeCloseTo(-95.64319);
    expect(p.uniqueId).toBe(77);
    expect(p.ignition).toBe(false);
    expect(p.duration).toBe(114);
    expect(p.speedMph).toBe(0);
    expect(p.odometerMiles).toBeCloseTo(32376.1);
    expect(p.numSatellites).toBe(7);
    expect(p.ecuOdometerMiles).toBeCloseTo(32372.0); // T suffix stripped
    expect(p.ecuVin).toBe('1N4AL3AP3GN360245');
    expect(p.dtc).toBe('0:0');
  });

  it('rejects empty input', () => {
    expect(() => parseCsvPacket('')).toThrow(PacketParseError);
  });

  it('rejects truncated packets', () => {
    expect(() => parseCsvPacket('F001,88X150380033')).toThrow(
      PacketParseError
    );
  });

  it('returns null for empty fields', () => {
    const p = parseCsvPacket(SAMPLE);
    expect(p.fenceId).toBeNull();
    expect(p.ecuRpm).toBeNull();
  });
});

describe('CsvLineFramer', () => {
  it('emits complete lines split across chunks', () => {
    const f = new CsvLineFramer();
    expect(f.feed(Buffer.from('F001,'))).toEqual([]);
    expect(f.feed(Buffer.from('88X1\n'))).toEqual(['F001,88X1']);
  });

  it('handles CRLF', () => {
    const f = new CsvLineFramer();
    expect(f.feed(Buffer.from('a\r\nb\r\n'))).toEqual(['a', 'b']);
  });

  it('handles multiple lines in one chunk', () => {
    const f = new CsvLineFramer();
    expect(f.feed(Buffer.from('one\ntwo\nthree\n'))).toEqual([
      'one',
      'two',
      'three',
    ]);
  });
});
