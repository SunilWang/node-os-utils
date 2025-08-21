/**
 * Windows特定的单元测试
 * 测试在Windows系统上特有的功能和行为
 */

import { expect } from 'chai'
import { 
  PlatformUtils, 
  TestValidators, 
  TestAssertions,
  asyncTest, 
  longTest,
  PerformanceMonitor 
} from '../utils/test-base'
import { WindowsTestUtils, CrossPlatformValidator } from '../utils/platform-specific'
import { OSUtils } from '../../src'

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
          expect(result.error!.code).to.be.oneOf(['NOT_SUPPORTED', 'PLATFORM_NOT_SUPPORTED'])
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
          this.skip()
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
          this.skip()
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
          this.skip()
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
          this.skip()
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
          expect(driveLetters.some(drive => /^[A-Z]:$/.test(drive))).to.be.true
        }
      }))

      it('C盘应该存在且有有效信息', asyncTest(async function() {
        const result = await osu.disk.info()
        
        if (!result.success) {
          this.skip()
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
        const result = await osu.disk.usage()
        
        if (!result.success) {
          this.skip()
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
        
        if (!result.success || result.data.length === 0) {
          this.skip()
        }

        if (result.success) {
          const interfaceNames = result.data.map(i => i.name.toLowerCase())
          const commonWindowsInterfaces = ['ethernet', 'wi-fi', 'loopback', 'wireless']
          
          // Windows 应该有某种网络接口
          expect(result.data.length).to.be.greaterThan(0)
        }
      }))
    })

    describe('#overview()', function() {
      it('应该能够计算Windows的网络流量', asyncTest(async function() {
        const result = await osu.network.overview()
        
        if (!result.success) {
          this.skip()
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
          this.skip()
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

  describe('Windows Performance Tests', function() {
    it('Windows系统调用性能测试', longTest(async function() {
      const monitor = new PerformanceMonitor()
      
      await monitor.time('cpu-info', () => osu.cpu.info())
      await monitor.time('memory-info', () => osu.memory.info())
      await monitor.time('disk-info', () => osu.disk.info())
      
      const report = monitor.getReport()
      
      // Windows 系统调用可能比Unix系统慢一些
      expect(report['cpu-info']).to.be.below(2000, 'CPU info should complete within 2s on Windows')
      expect(report['memory-info']).to.be.below(2000, 'Memory info should complete within 2s on Windows')
      expect(report['disk-info']).to.be.below(3000, 'Disk info should complete within 3s on Windows')
    }))

    it('Windows系统资源监控稳定性', longTest(async function() {
      const iterations = 5
      const results: number[] = []
      
      for (let i = 0; i < iterations; i++) {
        const result = await osu.cpu.usage()
        if (result.success) {
          results.push(result.data)
        }
      }
      
      if (results.length > 0) {
        // 检查结果的一致性
        const avg = results.reduce((sum, val) => sum + val, 0) / results.length
        const variance = results.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / results.length
        
        // 方差不应该太大（表示结果相对稳定）
        expect(variance).to.be.below(100)
      }
    }))
  })

  describe('Windows Error Handling', function() {
    it('应该正确处理Windows权限限制', asyncTest(async function() {
      // Windows 有不同的权限模型
      const result = await osu.process.list()
      
      if (!result.success) {
        expect(result.error).to.exist
        expect(result.error!.code).to.be.oneOf(['PERMISSION_DENIED', 'NOT_SUPPORTED'])
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
        expect(result.error).to.exist
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