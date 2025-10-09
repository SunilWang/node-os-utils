import { expect } from 'chai'

import { CrossPlatformValidator } from '../../utils/platform-specific'

describe('CrossPlatformValidator.validateSystemInfo', () => {
  it('应该验证包含核心字段的macOS系统信息', () => {
    const info = {
      hostname: 'MacBook-Pro',
      platform: 'darwin',
      release: '23.4.0',
      version: 'macOS 14.4',
      arch: 'arm64',
      uptime: 3600_000,
      uptimeSeconds: 3600,
      bootTime: Date.now() - 3600_000,
      loadAverage: {
        load1: 1.2,
        load5: 0.8,
        load15: 0.5
      }
    }

    expect(CrossPlatformValidator.validateSystemInfo(info)).to.be.true
  })

  it('缺少必要字段时应该验证失败', () => {
    const invalidInfo = {
      platform: 'darwin',
      release: '23.4.0'
    }

    expect(CrossPlatformValidator.validateSystemInfo(invalidInfo)).to.be.false
  })
})
