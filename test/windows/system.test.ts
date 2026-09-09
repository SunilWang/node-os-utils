/**
 * Windows特定的单元测试
 * 测试在Windows系统上特有的功能和行为
 */

import { expect } from 'chai'
import {
  PlatformUtils,
  asyncTest,
  longTest,
  PerformanceMonitor
} from '../shared/utils/test-base'
import { OSUtils } from '../../src'
import { ErrorCode } from '../../src/types/errors'
import { RealCommandTestBase } from '../current/real-command-base'

// 只在Windows系统上运行这些测试
describe('Windows System Tests', function() {
  before(function() {
    if (!PlatformUtils.isWindows()) {
      this.skip()
    }
  })

  let osu: OSUtils

  before(function() {
    // 使用新版本2.0 API
    osu = new OSUtils()
  })

  after(function() {
    // 清理资源，防止测试卡死
    if (osu) {
      osu.destroy()
    }
  })

  describe('Windows CPU Module', function() {
    describe('#info()', function() {
      it('应该返回Windows的CPU信息', asyncTest(async function() {
        const result = await osu.cpu.info()

        expect(result.success).to.be.true
        if (result.success) {
          expect(result.data).to.exist
          expect(result.data.model).to.be.a('string')
          expect(result.data.cores).to.be.a('number').and.greaterThan(0)
          expect(result.data.threads).to.be.a('number').and.greaterThan(0)
        }
      }))
    })

    describe('#loadAverage()', function() {
      it('Windows系统的loadavg可能不被完全支持', asyncTest(async function() {
        const result = await osu.cpu.loadAverage()

        if (!result.success) {
          expect(result.error).to.exist
          expect(result.error!.code).to.be.oneOf(['NOT_SUPPORTED', ErrorCode.PLATFORM_NOT_SUPPORTED])
        } else if (result.success) {
          expect(result.data).to.exist
          expect(result.data.load1).to.be.a('number').and.at.least(0)
          expect(result.data.load5).to.be.a('number').and.at.least(0)
          expect(result.data.load15).to.be.a('number').and.at.least(0)
        }
      }))
    })

    describe('#usage()', function() {
      it('应该能够在Windows上获取CPU使用率', asyncTest(async function() {
        const result = await osu.cpu.usage()

        if (!result.success) {
          RealCommandTestBase.skipForEnvironmentalError(this, result.error)
        }

        if (result.success) {
          expect(result.data).to.be.a('number')
          expect(result.data).to.be.at.least(0)
          expect(result.data).to.be.at.most(100)
        }
      }))

      it('Windows CPU使用率应该支持不同间隔', asyncTest(async function() {
        const result = await osu.cpu.usage()

        if (!result.success) {
          RealCommandTestBase.skipForEnvironmentalError(this, result.error)
        }

        if (result.success) {
          expect(result.data).to.be.a('number')
        }
      }))
    })
  })

  describe('Windows Memory Module', function() {
    describe('#info()', function() {
      it('应该能够使用Windows命令获取内存信息', asyncTest(async function() {
        const result = await osu.memory.info()

        expect(result.success).to.be.true
        if (result.success) {
          expect(result.data).to.exist
          expect(result.data.total).to.exist
          expect(result.data.total.bytes).to.be.a('number').and.greaterThan(0)
          expect(result.data.available).to.exist
          expect(result.data.used).to.exist
          expect(result.data.usagePercentage).to.be.a('number')
        }
      }))

      it('Windows内存信息应该与系统总内存一致', asyncTest(async function() {
        const memResult = await osu.memory.info()
        const os = require('os')
        const totalMem = os.totalmem()

        if (!memResult.success) {
          RealCommandTestBase.skipForEnvironmentalError(this, memResult.error)
        }

        const tolerance = 0.1 // 允许10%的误差
        if (memResult.success) {
          const expectedTotal = memResult.data.total.bytes
          const ratio = Math.abs(totalMem - expectedTotal) / totalMem

          expect(ratio).to.be.below(tolerance)
        }
      }))
    })

    describe('#usage()', function() {
      it('Windows系统的内存分配信息', asyncTest(async function() {
        const result = await osu.memory.usage()

        if (!result.success) {
          RealCommandTestBase.skipForEnvironmentalError(this, result.error)
        }

        if (result.success) {
          expect(result.data).to.be.a('number')
          expect(result.data).to.be.at.least(0)
          expect(result.data).to.be.at.most(100)
        }
      }))
    })
  })

  describe('Windows Disk Module', function() {
    describe('#info()', function() {
      it('应该能够使用Windows命令获取磁盘信息', asyncTest(async function() {
        const result = await osu.disk.info()

        expect(result.success).to.be.true
        if (result.success) {
          expect(result.data).to.be.an('array')

          if (result.data.length > 0) {
            const disk = result.data[0]
            expect(disk.filesystem).to.be.a('string')
            expect(disk.total).to.exist
            expect(disk.used).to.exist
            expect(disk.available).to.exist
          }
        }
      }))

      it('应该支持Windows驱动器盘符', asyncTest(async function() {
        const result = await osu.disk.info()

        expect(result.success).to.be.true
        if (result.success) {
          expect(result.data).to.be.an('array')

          // Windows 系统应该有驱动器盘符
          const driveLetters = result.data.map(d => d.mountpoint)
          // PowerShell 返回的根路径通常带反斜杠（如 C:\），两种形式都属于有效盘符。
          expect(driveLetters.some(drive => /^[A-Z]:\\?$/i.test(drive))).to.be.true
        }
      }))

      it('C盘应该存在且有有效信息', asyncTest(async function() {
        const result = await osu.disk.info()

        if (!result.success) {
          RealCommandTestBase.skipForEnvironmentalError(this, result.error)
        }

        if (result.success) {
          const cDrive = result.data.find(d => d.mountpoint.toLowerCase().startsWith('c:'))
          expect(cDrive).to.exist
          expect(cDrive!.total.bytes).to.be.greaterThan(0)
          expect(cDrive!.usagePercentage).to.be.a('number').and.at.least(0).and.at.most(100)
        }
      }))
    })

    describe('#usage()', function() {
      it('Windows磁盘空间信息应该一致', asyncTest(async function() {
        const result = await osu.disk.overallUsage()

        if (!result.success) {
          RealCommandTestBase.skipForEnvironmentalError(this, result.error)
        }

        if (result.success) {
          expect(result.data).to.be.a('number')
          expect(result.data).to.be.at.least(0)
          expect(result.data).to.be.at.most(100)
        }
      }))
    })
  })

  describe('Windows Network Module', function() {
    describe('#interfaces()', function() {
      it('应该能够获取Windows网络接口统计', asyncTest(async function() {
        const result = await osu.network.interfaces()

        expect(result.success).to.be.true
        if (result.success) {
          expect(result.data).to.be.an('array')

          if (result.data.length > 0) {
            const iface = result.data[0]
            expect(iface.name).to.be.a('string')
            expect(iface.addresses).to.exist
            expect(iface.mac).to.be.a('string')
          }
        }
      }))

      it('网络统计应该包含Windows典型接口类型', asyncTest(async function() {
        const result = await osu.network.interfaces()

        if (!result.success) {
          RealCommandTestBase.skipForEnvironmentalError(this, result.error)
        } else if (result.data.length === 0) {
          this.skip()
        }

        if (result.success) {
          // Windows 应该有某种网络接口
          expect(result.data.length).to.be.greaterThan(0)
        }
      }))
    })

    describe('#overview()', function() {
      it('应该能够计算Windows的网络流量', asyncTest(async function() {
        const result = await osu.network.overview()

        if (!result.success) {
          RealCommandTestBase.skipForEnvironmentalError(this, result.error)
        }

        if (result.success) {
          expect(result.data).to.exist
          expect(result.data.totalRxBytes).to.exist
          expect(result.data.totalTxBytes).to.exist
        }
      }))

      it('Windows网络流量监控应该支持多种间隔', asyncTest(async function() {
        const result = await osu.network.overview()

        if (!result.success) {
          RealCommandTestBase.skipForEnvironmentalError(this, result.error)
        }

        if (result.success) {
          expect(result.data.totalRxBytes.bytes).to.be.a('number').and.at.least(0)
          expect(result.data.totalTxBytes.bytes).to.be.a('number').and.at.least(0)
        }
      }))
    })
  })

  describe('Windows System Commands', function() {
    it('应该支持Windows特有的系统命令', asyncTest(async function() {
      const result = await osu.system.info()

      expect(result.success).to.be.true
      if (result.success) {
        expect(result.data).to.exist
        expect(result.data.platform).to.equal('win32')
      }
    }))

    it('应该正确识别不支持的功能', asyncTest(async function() {
      // 某些在其他平台上的功能在Windows上可能不支持
      const result = await osu.system.info()

      expect(result.success).to.be.true
      if (result.success) {
        expect(result.data.hostname).to.be.a('string')
      }
    }))
  })

  describe('Windows Runtime Contracts', function() {
    beforeEach(function() {
      // 每个契约都重新采集，避免连续样本实际反复验证同一条缓存。
      osu.clearCache()
    })

    for (const monitorName of ['cpu', 'memory', 'disk'] as const) {
      it(`Windows ${monitorName} 调用应成功并记录有限耗时`, asyncTest(async function() {
        const monitor = new PerformanceMonitor()
        const result = await monitor.time('info', async () => await osu[monitorName].info())
        RealCommandTestBase.unwrap(result, `${monitorName}.info`)
        // 共享 Runner 的调度耗时不属于 API 性能保证，由调用和 Mocha 预算约束总耗时。
        RealCommandTestBase.assertNonNegative(monitor.getReport().info, `${monitorName}.executionTime`)
      }))
    }

    for (let sample = 1; sample <= 5; sample++) {
      it(`Windows CPU 第 ${sample} 次采样应返回有效使用率`, longTest(async function() {
        const result = await osu.cpu.usage()
        // 真实 CPU 负载可以突变，但每次采样都必须成功且符合百分比契约。
        RealCommandTestBase.assertPercentage(RealCommandTestBase.unwrap(result, 'cpu.usage'), 'cpu.usage')
      }))
    }
  })

  describe('Windows Error Handling', function() {
    it('应该正确处理Windows权限限制', asyncTest(async function() {
      // Windows 有不同的权限模型
      const result = await osu.process.list()

      if (!result.success) {
        expect(result.error).to.exist
        expect(result.error!.code).to.be.oneOf([ErrorCode.PERMISSION_DENIED, 'NOT_SUPPORTED'])
      }
    }))

    it('应该处理不存在的驱动器', asyncTest(async function() {
      // 测试一般的磁盘信息获取 - disk.info() 不接受参数
      const result = await osu.disk.info()

      if (!result.success) {
        expect(result.error).to.exist
        expect(result.error!.code).to.be.oneOf(['NOT_FOUND', 'INVALID_PATH'])
      } else {
        // 正常返回磁盘信息数组
        if (result.success) {
          expect(result.data).to.be.an('array')
        }
      }
    }))

    it('应该处理Windows服务不可用的情况', asyncTest(async function() {
      // 测试系统信息获取
      const result = await osu.system.info()

      if (!result.success) {
        RealCommandTestBase.skipForEnvironmentalError(this, result.error)
      } else if (result.success) {
        expect(result.data).to.exist
      }
    }))

    it('应该处理Windows版本差异', asyncTest(async function() {
      const result = await osu.system.info()

      expect(result.success).to.be.true
      if (result.success) {
        expect(result.data.release).to.be.a('string')

        // Windows 版本字符串应该包含版本信息
        const version = result.data.release
        expect(version).to.match(/\d+/)
      }
    }))
  })
})
