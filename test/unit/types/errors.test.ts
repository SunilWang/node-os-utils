/**
 * 错误处理单元测试
 * 测试错误类型、错误码和错误处理机制
 */

import { expect } from 'chai'
import { MonitorError, ErrorCode } from '../../../src/types/errors'

describe('Error Handling Unit Tests', function() {
  describe('ErrorCode枚举', function() {
    it('应该包含所有预期的错误码', function() {
      const expectedCodes = [
        'PLATFORM_NOT_SUPPORTED',
        'COMMAND_FAILED',
        'PARSE_ERROR',
        'PERMISSION_DENIED',
        'TIMEOUT',
        'INVALID_CONFIG',
        'NOT_AVAILABLE',
        'FILE_NOT_FOUND',
        'NETWORK_ERROR'
      ]

      expectedCodes.forEach(code => {
        expect(ErrorCode).to.have.property(code)
        expect(ErrorCode[code as keyof typeof ErrorCode]).to.be.a('string')
      })
    })

    it('错误码应该是字符串类型', function() {
      Object.values(ErrorCode).forEach(code => {
        expect(code).to.be.a('string')
        expect(code.length).to.be.greaterThan(0)
      })
    })
  })

  describe('MonitorError创建', function() {
    it('应该能够创建基本的MonitorError', function() {
      const error = new MonitorError(
        'Test error message',
        ErrorCode.COMMAND_FAILED,
        'test-platform'
      )

      expect(error.code).to.equal(ErrorCode.COMMAND_FAILED)
      expect(error.message).to.equal('Test error message')
      expect(error.platform).to.equal('test-platform')
      expect(error.name).to.equal('MonitorError')
      expect(error).to.be.instanceof(Error)
    })

    it('应该能够创建包含详细信息的MonitorError', function() {
      const details = {
        command: 'ps aux',
        exitCode: 1,
        stderr: 'Permission denied'
      }

      const error = new MonitorError(
        'Failed to execute command',
        ErrorCode.PERMISSION_DENIED,
        'linux',
        details
      )

      expect(error.details).to.deep.equal(details)
      expect(error.code).to.equal(ErrorCode.PERMISSION_DENIED)
      expect(error.platform).to.equal('linux')
    })
  })

  describe('静态工厂方法', function() {
    it('应该能够创建平台不支持错误', function() {
      const error = MonitorError.createPlatformNotSupported('win32', 'temperature')

      expect(error.code).to.equal(ErrorCode.PLATFORM_NOT_SUPPORTED)
      expect(error.platform).to.equal('win32')
      expect(error.message).to.include('temperature')
      expect(error.details).to.have.property('feature', 'temperature')
    })

    it('应该能够创建命令执行失败错误', function() {
      const error = MonitorError.createCommandFailed('linux', 'ps aux', { exitCode: 1 })

      expect(error.code).to.equal(ErrorCode.COMMAND_FAILED)
      expect(error.platform).to.equal('linux')
      expect(error.message).to.include('ps aux')
      expect(error.details).to.have.property('command', 'ps aux')
      expect(error.details).to.have.property('exitCode', 1)
    })

    it('应该能够创建解析错误', function() {
      const error = MonitorError.createParseError('darwin', 'invalid data', 'malformed JSON')

      expect(error.code).to.equal(ErrorCode.PARSE_ERROR)
      expect(error.platform).to.equal('darwin')
      expect(error.message).to.include('malformed JSON')
      expect(error.details).to.have.property('data', 'invalid data')
      expect(error.details).to.have.property('reason', 'malformed JSON')
    })
  })

  describe('错误序列化', function() {
    it('应该能够序列化为JSON', function() {
      const error = new MonitorError(
        'Serialization test',
        ErrorCode.COMMAND_FAILED,
        'test',
        { extra: 'data' }
      )

      const json = error.toJSON()

      expect(json).to.have.property('name', 'MonitorError')
      expect(json).to.have.property('message', 'Serialization test')
      expect(json).to.have.property('code', ErrorCode.COMMAND_FAILED)
      expect(json).to.have.property('platform', 'test')
      expect(json).to.have.property('details')
      expect((json as any).details).to.deep.equal({ extra: 'data' })
    })

    it('应该能够完整序列化到JSON字符串', function() {
      const error = new MonitorError(
        'JSON string test',
        ErrorCode.TIMEOUT,
        'network'
      )

      const jsonString = JSON.stringify(error)
      const parsed = JSON.parse(jsonString)

      expect(parsed.name).to.equal('MonitorError')
      expect(parsed.message).to.equal('JSON string test')
      expect(parsed.code).to.equal(ErrorCode.TIMEOUT)
      expect(parsed.platform).to.equal('network')
    })
  })

  describe('错误比较和匹配', function() {
    it('应该能够比较错误类型', function() {
      const error1 = new MonitorError('First error', ErrorCode.TIMEOUT, 'cpu')
      const error2 = new MonitorError('Second error', ErrorCode.TIMEOUT, 'memory')
      const error3 = new MonitorError('Third error', ErrorCode.PERMISSION_DENIED, 'cpu')

      expect(error1.code).to.equal(error2.code)
      expect(error1.code).to.not.equal(error3.code)
      expect(error1.platform).to.equal(error3.platform)
      expect(error1.platform).to.not.equal(error2.platform)
    })

    it('应该能够匹配错误模式', function() {
      const errors = [
        new MonitorError('CPU timeout', ErrorCode.TIMEOUT, 'cpu'),
        new MonitorError('Memory access denied', ErrorCode.PERMISSION_DENIED, 'memory'),
        new MonitorError('Disk command failed', ErrorCode.COMMAND_FAILED, 'disk'),
        new MonitorError('Network timeout', ErrorCode.TIMEOUT, 'network')
      ]

      // 找出所有超时错误
      const timeoutErrors = errors.filter(error => error.code === ErrorCode.TIMEOUT)
      expect(timeoutErrors).to.have.length(2)

      // 找出所有CPU相关错误
      const cpuErrors = errors.filter(error => error.platform === 'cpu')
      expect(cpuErrors).to.have.length(1)
      expect(cpuErrors[0].code).to.equal(ErrorCode.TIMEOUT)
    })
  })

  describe('边界情况', function() {
    it('应该处理空消息', function() {
      const error = new MonitorError('', ErrorCode.PARSE_ERROR, 'test')
      expect(error.message).to.equal('')
      expect(error.code).to.equal(ErrorCode.PARSE_ERROR)
    })

    it('应该处理特殊字符', function() {
      const specialMessage = 'Error with 特殊字符 and émojis 🚫'
      const error = new MonitorError(specialMessage, ErrorCode.INVALID_CONFIG, 'test')
      expect(error.message).to.equal(specialMessage)
    })

    it('应该处理长错误消息', function() {
      const longMessage = 'A'.repeat(1000)
      const error = new MonitorError(longMessage, ErrorCode.COMMAND_FAILED, 'test')
      expect(error.message).to.equal(longMessage)
      expect(error.message.length).to.equal(1000)
    })

    it('应该处理复杂的详细信息对象', function() {
      const complexDetails = {
        nested: {
          object: true,
          array: [1, 2, 3],
          null_value: null,
          undefined_value: undefined
        }
      }

      expect(() => {
        new MonitorError('Complex details', ErrorCode.INVALID_CONFIG, 'test', complexDetails)
      }).to.not.throw()
    })
  })

  describe('错误继承', function() {
    it('应该正确继承Error类', function() {
      const error = new MonitorError('Inheritance test', ErrorCode.COMMAND_FAILED, 'test')

      expect(error).to.be.instanceof(Error)
      expect(error).to.be.instanceof(MonitorError)
      expect(error.name).to.equal('MonitorError')
      expect(error.stack).to.be.a('string')
    })
  })

  describe('多语言错误消息', function() {
    it('应该支持不同语言的错误消息', function() {
      const messages = {
        en: 'File not found',
        zh: '文件未找到',
        ja: 'ファイルが見つかりません',
        fr: 'Fichier non trouvé'
      }

      Object.entries(messages).forEach(([lang, message]) => {
        const error = new MonitorError(message, ErrorCode.FILE_NOT_FOUND, 'file-system')
        expect(error.message).to.equal(message)
        expect(error.code).to.equal(ErrorCode.FILE_NOT_FOUND)
      })
    })
  })
})
