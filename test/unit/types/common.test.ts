/**
 * Common Types单元测试
 * 测试DataSize类和其他通用类型
 */

import { expect } from 'chai'
import { DataSize } from '../../../src/types/common'

describe('DataSize Unit Tests', function() {
  describe('构造函数和基本转换', function() {
    it('应该能够从字节数创建DataSize', function() {
      const size = new DataSize(1024)
      expect(size.bytes).to.equal(1024)
      expect(size.toKB()).to.equal(1)
      expect(size.toMB()).to.equal(1/1024)
    })

    it('应该正确转换各种单位', function() {
      const gb = new DataSize(1024 * 1024 * 1024) // 1GB

      expect(gb.bytes).to.equal(1073741824)
      expect(gb.toKB()).to.equal(1048576)
      expect(gb.toMB()).to.equal(1024)
      expect(gb.toGB()).to.equal(1)
      expect(gb.toTB()).to.equal(1/1024)
    })

    it('应该处理零值', function() {
      const zero = new DataSize(0)

      expect(zero.bytes).to.equal(0)
      expect(zero.toKB()).to.equal(0)
      expect(zero.toMB()).to.equal(0)
      expect(zero.toGB()).to.equal(0)
      expect(zero.toTB()).to.equal(0)
    })
  })

  describe('静态创建方法', function() {
    it('应该能够从KB创建', function() {
      const size = DataSize.fromKB(1)
      expect(size.bytes).to.equal(1024)
      expect(size.toKB()).to.equal(1)
    })

    it('应该能够从MB创建', function() {
      const size = DataSize.fromMB(1)
      expect(size.bytes).to.equal(1024 * 1024)
      expect(size.toMB()).to.equal(1)
    })

    it('应该能够从GB创建', function() {
      const size = DataSize.fromGB(1)
      expect(size.bytes).to.equal(1024 * 1024 * 1024)
      expect(size.toGB()).to.equal(1)
    })

    it('应该能够从字节创建', function() {
      const size = DataSize.fromBytes(2048)
      expect(size.bytes).to.equal(2048)
      expect(size.toKB()).to.equal(2)
    })
  })

  describe('格式化功能', function() {
    it('应该能够格式化为人性化字符串', function() {
      const tests = [
        { bytes: 512, expected: '512 B' },
        { bytes: 1024, expected: '1.00 KB' },
        { bytes: 1536, expected: '1.50 KB' },
        { bytes: 1024 * 1024, expected: '1.00 MB' },
        { bytes: 1024 * 1024 * 1024, expected: '1.00 GB' },
        { bytes: 1024 * 1024 * 1024 * 1024, expected: '1.00 TB' }
      ]

      tests.forEach(test => {
        const size = new DataSize(test.bytes)
        expect(size.toString()).to.equal(test.expected)
      })
    })

    it('应该能够格式化为指定单位', function() {
      const size = new DataSize(1024 * 1024 * 1.5) // 1.5 MB

      expect(size.toString('B')).to.equal('1572864 B')
      expect(size.toString('KB')).to.equal('1536.00 KB')
      expect(size.toString('MB')).to.equal('1.50 MB')
      expect(size.toString('GB')).to.equal('0.00 GB')
    })

    it('应该支持自动选择最佳单位', function() {
      const size = new DataSize(1536) // 1.5 KB
      expect(size.toString('auto')).to.equal('1.50 KB')
      expect(size.toString()).to.equal('1.50 KB') // 默认为auto
    })
  })

  describe('边界情况和错误处理', function() {
    it('应该拒绝负数', function() {
      expect(() => new DataSize(-1024)).to.throw('Data size cannot be negative')
    })

    it('应该处理非常大的数值', function() {
      const size = new DataSize(Number.MAX_SAFE_INTEGER)
      expect(size.bytes).to.equal(Number.MAX_SAFE_INTEGER)
    })

    it('应该处理小数字节数', function() {
      const size = new DataSize(1023.5)
      expect(size.bytes).to.equal(1023.5)
      expect(size.toKB()).to.be.closeTo(0.9995, 0.0001)
    })
  })

  describe('实用方法', function() {
    it('应该提供toBytes方法', function() {
      const size = new DataSize(1024)
      expect(size.toBytes()).to.equal(1024)
      expect(size.toBytes()).to.equal(size.bytes)
    })

    it('应该正确处理单位转换精度', function() {
      const size = new DataSize(1024 * 1024 + 512 * 1024) // 1.5 MB
      expect(size.toMB()).to.equal(1.5)
      expect(size.toKB()).to.equal(1536)
    })
  })

  describe('静态工厂方法验证', function() {
    it('所有静态方法应该返回正确的DataSize实例', function() {
      const fromBytes = DataSize.fromBytes(1024)
      const fromKB = DataSize.fromKB(1)
      const fromMB = DataSize.fromMB(1/1024)
      const fromGB = DataSize.fromGB(1/(1024*1024))

      expect(fromBytes.bytes).to.equal(1024)
      expect(fromKB.bytes).to.equal(1024)
      expect(fromMB.bytes).to.equal(1024)
      expect(fromGB.bytes).to.equal(1024)
    })
  })

  describe('字符串表示', function() {
    it('应该提供有意义的字符串表示', function() {
      const size = new DataSize(2048)
      const str = size.toString()
      expect(str).to.include('2.00')
      expect(str).to.include('KB')
    })

    it('应该支持所有单位的强制格式化', function() {
      const size = new DataSize(1024 * 1024) // 1 MB

      expect(size.toString('B')).to.include('1048576')
      expect(size.toString('KB')).to.include('1024.00')
      expect(size.toString('MB')).to.include('1.00')
      expect(size.toString('GB')).to.include('0.00')
      expect(size.toString('TB')).to.include('0.00')
    })
  })
})
