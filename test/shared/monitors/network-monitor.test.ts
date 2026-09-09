import { expect } from 'chai';

import { NetworkMonitor } from '../../../src/monitors/network-monitor';

describe('NetworkMonitor 网关与接口转换', () => {
  const monitor = new NetworkMonitor({} as any);

  it('应保留无显式网关但存在接口的默认路由', () => {
    const result = (monitor as any).transformGatewayInfo({
      gateway: null,
      interface: 'ppp0'
    });

    expect(result).to.deep.equal({ gateway: null, interface: 'ppp0' });
  });

  it('应兼容 iface/device 字段并返回可用接口名', () => {
    const result = (monitor as any).transformGatewayInfo({
      iface: 'eth0',
      address: '192.168.0.1'
    });

    expect(result).to.deep.equal({ gateway: '192.168.0.1', interface: 'eth0' });
  });

  it('数组结构应优先保留接口顶层的 MAC 地址', () => {
    const result = (monitor as any).transformNetworkInterfaces([{
      name: 'Ethernet',
      mac: 'aa:bb:cc:dd:ee:ff',
      state: 'up',
      internal: false,
      addresses: [{
        address: '192.168.1.10',
        netmask: '255.255.255.0',
        family: 'IPv4',
        internal: false
      }]
    }]);

    expect(result).to.have.lengthOf(1);
    expect(result[0].mac).to.equal('aa:bb:cc:dd:ee:ff');
  });
});

describe('NetworkMonitor bandwidth() MonitorResult 契约', () => {
  const createAdapter = (getNetworkStats: () => Promise<any[]>) => ({
    getPlatform: () => 'linux',
    isSupported: () => true,
    getNetworkStats
  }) as any;

  it('采样失败时应返回错误结果而不是抛出异常', async () => {
    const adapter = createAdapter(async () => { throw new Error('stats unavailable'); });
    const monitor = new NetworkMonitor(adapter, { includeBandwidth: true, bandwidthInterval: 5 });

    const result = await monitor.bandwidth();

    expect(result.success).to.be.false;
    if (!result.success) {
      expect(result.error.message).to.include('stats unavailable');
    }
  });

  it('正常两次采样应计算各接口收发速率', async () => {
    let call = 0;
    const adapter = createAdapter(async () => {
      call += 1;
      return [{
        interface: 'eth0',
        rxBytes: call * 1000,
        txBytes: call * 500,
        rxPackets: call,
        txPackets: call,
        rxErrors: 0,
        txErrors: 0
      }];
    });
    const monitor = new NetworkMonitor(adapter, { includeBandwidth: true, bandwidthInterval: 10 });

    const result = await monitor.bandwidth();

    expect(result.success).to.be.true;
    if (result.success) {
      expect(result.data.interval).to.equal(10);
      expect(result.data.interfaces).to.have.lengthOf(1);
      expect(result.data.interfaces[0].interface).to.equal('eth0');
      expect(Number.isFinite(result.data.interfaces[0].rxSpeed)).to.be.true;
      expect(result.data.interfaces[0].rxSpeed).to.be.greaterThan(0);
      expect(result.data.interfaces[0].rxSpeedFormatted).to.include('/s');
    }
  });

  it('bandwidthInterval 为 0 时应按最小间隔计算，不产生非有限速率', async () => {
    let call = 0;
    const adapter = createAdapter(async () => {
      call += 1;
      return [{ interface: 'eth0', rxBytes: call * 100, txBytes: call * 100 }];
    });
    const monitor = new NetworkMonitor(adapter, { includeBandwidth: true, bandwidthInterval: 0 });

    const result = await monitor.bandwidth();

    expect(result.success).to.be.true;
    if (result.success) {
      expect(result.data.interval).to.be.at.least(1);
      for (const iface of result.data.interfaces) {
        expect(Number.isFinite(iface.rxSpeed)).to.be.true;
        expect(Number.isFinite(iface.txSpeed)).to.be.true;
      }
    }
  });

  it('safeParseNumber 应将负数钳制为 0，避免 DataSize 构造抛异常', () => {
    const monitor = new NetworkMonitor({} as any);
    const safeParseNumber = (monitor as any).safeParseNumber.bind(monitor);

    expect(safeParseNumber(-1024)).to.equal(0);
    expect(safeParseNumber('-5')).to.equal(0);
    expect(safeParseNumber(42)).to.equal(42);
    expect(safeParseNumber('abc')).to.equal(0);
  });
});
