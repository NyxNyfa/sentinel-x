import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractNodeFromTopic,
  isSameNode,
} from '../src/utils/sentinelNodeUtils.ts';

test('Topic parsing: extractNodeFromTopic handles standard, alias, hyphenated, and nested topics', () => {
  // Standard topics
  assert.equal(extractNodeFromTopic('sentinelx/SENTINEL-X-01/telemetry'), 'SENTINEL-X-01');
  assert.equal(extractNodeFromTopic('sentinelx/SENTINEL-X-02/telemetry'), 'SENTINEL-X-02');
  assert.equal(extractNodeFromTopic('sentinelx/SENTINEL-X-02/event'), 'SENTINEL-X-02');
  assert.equal(extractNodeFromTopic('sentinelx/SENTINEL-X-02/data'), 'SENTINEL-X-02');
  assert.equal(extractNodeFromTopic('sentinelx/SENTINEL-X-02'), 'SENTINEL-X-02');

  // Hyphenated prefix (sentinel-x/...)
  assert.equal(extractNodeFromTopic('sentinel-x/SENTINEL-X-02/telemetry'), 'SENTINEL-X-02');
  assert.equal(extractNodeFromTopic('sentinel_x/SENTINEL-X-02/telemetry'), 'SENTINEL-X-02');

  // Nested user/team paths
  assert.equal(extractNodeFromTopic('sentinelx/daniyal/SENTINEL-X-02/telemetry'), 'SENTINEL-X-02');
  assert.equal(extractNodeFromTopic('sentinelx/lab/trafo/SENTINEL-X-02/telemetry'), 'SENTINEL-X-02');

  // Single-digit or alias formats
  assert.equal(extractNodeFromTopic('sentinelx/SENTINEL-X-2/telemetry'), 'SENTINEL-X-2');
  assert.equal(extractNodeFromTopic('sentinelx/NODE-02/telemetry'), 'NODE-02');
  assert.equal(extractNodeFromTopic('sentinelx/PROTOTYPE-02/telemetry'), 'PROTOTYPE-02');

  // Reserved non-node topics should yield null
  assert.equal(extractNodeFromTopic('sentinelx/telemetry'), null);
  assert.equal(extractNodeFromTopic('sentinelx/event'), null);
  assert.equal(extractNodeFromTopic('sentinelx/+/telemetry'), null);
  assert.equal(extractNodeFromTopic(''), null);
  assert.equal(extractNodeFromTopic(null), null);
});

test('Node comparison: isSameNode normalizes casing, zero-padding, and delimiters', () => {
  // Exact match
  assert.equal(isSameNode('SENTINEL-X-02', 'SENTINEL-X-02'), true);

  // Case insensitivity
  assert.equal(isSameNode('sentinel-x-02', 'SENTINEL-X-02'), true);

  // Zero padding variation (02 vs 2, 002 vs 2)
  assert.equal(isSameNode('SENTINEL-X-02', 'SENTINEL-X-2'), true);
  assert.equal(isSameNode('SENTINEL-X-2', 'SENTINEL-X-02'), true);
  assert.equal(isSameNode('SENTINEL-X-002', 'SENTINEL-X-2'), true);

  // Delimiter variation (hyphen vs underscore vs compact)
  assert.equal(isSameNode('SENTINEL-X-02', 'SENTINEL_X_02'), true);
  assert.equal(isSameNode('SENTINEL-X-02', 'SENTINELX02'), true);
  assert.equal(isSameNode('SENTINEL-X-02', 'SENTINEL-X 02'), true);

  // Distinct nodes must NOT match
  assert.equal(isSameNode('SENTINEL-X-01', 'SENTINEL-X-02'), false);
  assert.equal(isSameNode('SENTINEL-X-02', 'SENTINEL-X-03'), false);
  assert.equal(isSameNode('SENTINEL-X-01', null), false);
  assert.equal(isSameNode(null, 'SENTINEL-X-02'), false);
});

test('Simulated Telemetry Ingestion: Prototype 2 firmware sending node=SENTINEL-X-01 on topic sentinelx/SENTINEL-X-02/telemetry', () => {
  // Initial SCADA prototypes list
  let prototypes = [
    {
      nodeId: 'SENTINEL-X-01',
      connected: false,
      lastSeenMs: null,
      lastSeenLabel: 'MENUNGGU...',
      packetsCount: 0,
      telemetry: { node: 'SENTINEL-X-01', metrics: { I_rms: 4.25, gas_ppm: 45, vib_g: 0.012, bus_secure: true } },
    },
    {
      nodeId: 'SENTINEL-X-02',
      connected: false,
      lastSeenMs: null,
      lastSeenLabel: 'MENUNGGU...',
      packetsCount: 0,
      telemetry: { node: 'SENTINEL-X-02', metrics: { I_rms: 4.25, gas_ppm: 45, vib_g: 0.012, bus_secure: true } },
    },
  ];

  // Ingestion helper replicating the hook logic
  function simulateIngest(topic, rawPayload) {
    const topicNode = extractNodeFromTopic(topic);
    const resolvedId = (topicNode || rawPayload.node || 'SENTINEL-X-01').trim().toUpperCase();
    const nowMs = Date.now();
    const timeLabel = '12:00:00.000';

    const existingIdx = prototypes.findIndex((p) => isSameNode(p.nodeId, resolvedId));
    assert.ok(existingIdx >= 0, `Node ${resolvedId} should be found in registered prototypes`);

    const existing = prototypes[existingIdx];
    const canonicalId = existing.nodeId;
    prototypes[existingIdx] = {
      ...existing,
      connected: true,
      lastSeenMs: nowMs,
      lastSeenLabel: timeLabel,
      packetsCount: existing.packetsCount + 1,
      telemetry: {
        ...rawPayload,
        node: canonicalId,
      },
    };
  }

  // 1. Packet from Prototype 1
  simulateIngest('sentinelx/SENTINEL-X-01/telemetry', {
    node: 'SENTINEL-X-01',
    metrics: { I_rms: 4.3, gas_ppm: 48, vib_g: 0.015, bus_secure: true },
  });

  assert.equal(prototypes[0].connected, true);
  assert.equal(prototypes[0].packetsCount, 1);
  assert.equal(prototypes[1].connected, false);
  assert.equal(prototypes[1].packetsCount, 0);

  // 2. Packet from Prototype 2 with the exact firmware bug: doc["node"] = "SENTINEL-X-01"
  simulateIngest('sentinelx/SENTINEL-X-02/telemetry', {
    node: 'SENTINEL-X-01', // Firmware bug in TinyML_V2.0.ino!
    metrics: { I_rms: 7.8, gas_ppm: 120, vib_g: 0.025, bus_secure: true },
  });

  // Verify Prototype 2 is now ONLINE and updated with its own data
  assert.equal(prototypes[1].connected, true, 'Prototype 2 should be ONLINE');
  assert.equal(prototypes[1].packetsCount, 1, 'Prototype 2 packetsCount should be incremented');
  assert.equal(prototypes[1].telemetry.node, 'SENTINEL-X-02', 'Telemetry node should be canonicalized to SENTINEL-X-02');
  assert.equal(prototypes[1].telemetry.metrics.I_rms, 7.8, 'Prototype 2 metrics should be preserved');

  // Verify Prototype 1 was NOT corrupted by Prototype 2's packet
  assert.equal(prototypes[0].connected, true);
  assert.equal(prototypes[0].packetsCount, 1);
  assert.equal(prototypes[0].telemetry.metrics.I_rms, 4.3);

  // 3. Second packet from Prototype 2
  simulateIngest('sentinelx/SENTINEL-X-02/telemetry', {
    node: 'SENTINEL-X-01',
    metrics: { I_rms: 8.1, gas_ppm: 125, vib_g: 0.026, bus_secure: true },
  });
  assert.equal(prototypes[1].packetsCount, 2);

  // 4. Test Liveness timeout & label state
  const mockNow = Date.now() + 35000;
  prototypes = prototypes.map((p) => {
    if (p.connected && p.lastSeenMs && mockNow - p.lastSeenMs > 30000) {
      return { ...p, connected: false };
    }
    return p;
  });

  assert.equal(prototypes[1].connected, false);
  // Status label for a timed-out node that has sent data (packetsCount > 0)
  const p2Label = prototypes[1].connected
    ? 'Online'
    : prototypes[1].packetsCount > 0
      ? 'Offline'
      : 'Menunggu';
  assert.equal(p2Label, 'Offline', 'Node with packetsCount > 0 should display Offline, not Menunggu');
});
