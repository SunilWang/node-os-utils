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
});
