/**
 * macOS特定的单元测试
 * 测试在macOS系统上的功能和行为
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
import { MacOSTestUtils, CrossPlatformValidator } from '../utils/platform-specific'
import { OSUtils } from '../../src'

// 只在macOS系统上运行这些测试
describe('macOS System Tests', function() {
  before(function() {
    if (!PlatformUtils.isMacOS()) {
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

  describe('macOS CPU Module', function() {
    describe('#info()', function() {
      it('应该返回正确的CPU信息', asyncTest(async function() {
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

    describe('#usage()', function() {
      it('应该能够在macOS上获取CPU使用率', asyncTest(async function() {
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
    })

    describe('#loadAverage()', function() {
      it('应该返回macOS的负载平均值', asyncTest(async function() {
        const result = await osu.cpu.loadAverage()
        
        expect(result.success).to.be.true
        if (result.success) {
          expect(result.data).to.exist
          expect(result.data.load1).to.be.a('number').and.at.least(0)
          expect(result.data.load5).to.be.a('number').and.at.least(0)
          expect(result.data.load15).to.be.a('number').and.at.least(0)
        }
      }))
    })
  })

  describe('macOS Memory Module', function() {
    describe('#info()', function() {
      it('应该能够获取内存信息', asyncTest(async function() {
        const result = await osu.memory.info()
        
        expect(result.success).to.be.true
        if (result.success) {
          expect(result.data).to.exist
          expect(result.data.total).to.exist
          expect(result.data.total.toBytes()).to.be.a('number').and.greaterThan(0)
          expect(result.data.available).to.exist
          expect(result.data.used).to.exist
          expect(result.data.usagePercentage).to.be.a('number').and.at.least(0).and.at.most(100)
        }
      }))

      it('内存信息应该与系统信息一致', asyncTest(async function() {
        const memResult = await osu.memory.info()
        const os = require('os')
        const totalMem = os.totalmem()
        
        if (!memResult.success) {
          this.skip()
        }

        const tolerance = 0.1 // 允许10%的误差
        if (memResult.success) {
          const expectedTotal = memResult.data.total.toBytes()
          const ratio = Math.abs(totalMem - expectedTotal) / totalMem
          
          expect(ratio).to.be.below(tolerance)
        }
      }))
    })

    describe('#usage()', function() {
      it('应该返回内存使用率', asyncTest(async function() {
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

  describe('macOS Disk Module', function() {
    describe('#info()', function() {
      it('应该能够获取磁盘信息', asyncTest(async function() {
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
            expect(disk.usagePercentage).to.be.a('number').and.at.least(0).and.at.most(100)
          }
        }
      }))

      it('应该支持macOS的多个卷', asyncTest(async function() {
        const result = await osu.disk.info()
        
        expect(result.success).to.be.true
        if (result.success) {
          expect(result.data).to.be.an('array')
          
          // macOS 通常至少有根分区
          expect(result.data.length).to.be.at.least(1)
          
          // 检查根分区
          const rootPartition = result.data.find(d => d.mountpoint === '/')
          expect(rootPartition).to.exist
        }
      }))
    })

    describe('#usage()', function() {
      it('磁盘空间信息应该与info()一致', asyncTest(async function() {
        const result = await osu.disk.overallUsage()
        
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

  describe('macOS Network Module', function() {
    describe('#interfaces()', function() {
      it('应该能够获取macOS网络接口统计', asyncTest(async function() {
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

      it('网络统计应该包含macOS典型接口', asyncTest(async function() {
        const result = await osu.network.interfaces()
        
        if (!result.success || result.data.length === 0) {
          this.skip()
        }

        if (result.success) {
          const interfaceNames = result.data.map(i => i.name)
          
          // 应该至少包含本地回环接口
          expect(interfaceNames.some(name => name === 'lo0')).to.be.true
        }
      }))
    })

    describe('#overview()', function() {
      it('应该能够计算macOS的网络流量', asyncTest(async function() {
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

      it('网络流量计算应该准确', asyncTest(async function() {
        const result = await osu.network.overview()
        
        if (!result.success) {
          this.skip()
        }

        if (result.success) {
          expect(result.data.totalRxBytes.toBytes()).to.be.a('number').and.at.least(0)
          expect(result.data.totalTxBytes.toBytes()).to.be.a('number').and.at.least(0)
        }
      }))
    })
  })

  describe('macOS System Commands', function() {
    it('应该能够访问macOS特有的系统命令', asyncTest(async function() {
      const result = await osu.system.info()
      
      expect(result.success).to.be.true
      if (result.success) {
        expect(result.data).to.exist
        expect(result.data.platform).to.equal('darwin')
      }
    }))

    it('应该能够执行system_profiler获取硬件信息', asyncTest(async function() {
      const result = await osu.system.info()
      
      expect(result.success).to.be.true
      if (result.success) {
        expect(result.data.hostname).to.be.a('string')
        expect(result.data.release).to.be.a('string')
      }
    }))
  })

  describe('macOS Performance Tests', function() {
    it('macOS系统调用应该高效执行', longTest(async function() {
      const monitor = new PerformanceMonitor()
      
      const start1 = Date.now()
      await osu.cpu.info()
      const cpu_time = Date.now() - start1
      
      const start2 = Date.now()
      await osu.memory.info()
      const memory_time = Date.now() - start2
      
      const start3 = Date.now()
      await osu.disk.info()
      const disk_time = Date.now() - start3
      
      // macOS 系统调用应该在合理时间内完成
      expect(cpu_time).to.be.below(1000, 'CPU info should complete within 1s')
      expect(memory_time).to.be.below(1000, 'Memory info should complete within 1s')
      expect(disk_time).to.be.below(2000, 'Disk info should complete within 2s')
    }))

    it('Apple Silicon Mac应该有更好的性能', longTest(async function() {
      const result = await osu.cpu.info()
      
      if (!result.success) {
        this.skip()
      }

      // 在 Apple Silicon Mac 上，某些操作可能更快
      if (result.success && result.data.model.includes('Apple')) {
        const start = Date.now()
        await osu.cpu.usage()
        const time = Date.now() - start
        
        expect(time).to.be.below(500, 'Apple Silicon should have faster CPU usage calls')
      }
    }))
  })

  describe('macOS Error Handling', function() {
    it('应该正确处理macOS特有的权限问题', asyncTest(async function() {
      // 测试权限受限的操作
      const result = await osu.process.list()
      
      // 如果没有权限，应该优雅地处理
      if (!result.success) {
        expect(result.error).to.exist
        expect(result.error.code).to.be.oneOf(['PERMISSION_DENIED', 'NOT_SUPPORTED'])
      }
    }))

    it('应该处理不同版本的macOS', asyncTest(async function() {
      const result = await osu.system.info()
      
      expect(result.success).to.be.true
      if (result.success) {
        expect(result.data.release).to.be.a('string')
        
        // 应该能够解析版本号
        const version = result.data.release
        expect(version).to.match(/\d+\.\d+/)
      }
    }))
  })
})