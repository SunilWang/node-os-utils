/**
 * CommandExecutor单元测试
 * 测试命令执行器的核心功能和错误处理
 */

import { expect } from 'chai'
import { CommandExecutor } from '../../../src/utils/command-executor'

describe('CommandExecutor Unit Tests', function() {
  let executor: CommandExecutor

  beforeEach(function() {
    executor = new CommandExecutor('test-platform', {
      timeout: 5000,
      encoding: 'utf8'
    })
  })

  describe('基本命令执行', function() {
    it('应该能够执行简单的系统命令', async function() {
      // 使用跨平台兼容的命令
      const command = process.platform === 'win32' ? 'echo hello' : 'echo "hello"'
      const result = await executor.execute(command)

      expect(result.stdout.trim()).to.equal('hello')
      expect(result.stderr).to.equal('')
      expect(result.exitCode).to.equal(0)
      expect(result.platform).to.equal('test-platform')
      expect(result.command).to.equal(command)
      expect(result.executionTime).to.be.a('number')
    })

    it('应该正确处理命令执行失败', async function() {
      try {
        await executor.execute('nonexistent-command-12345')
        // 如果没有抛出错误，则测试失败
        expect.fail('应该抛出错误')
      } catch (error: any) {
        expect(error).to.be.an('error')
        // 检查是否是MonitorError
        if (error.code) {
          expect(error.code).to.be.oneOf(['COMMAND_FAILED', 'FILE_NOT_FOUND'])
        }
      }
    })

    it('应该正确处理有stderr输出但成功的命令', async function() {
      // 某些命令会向stderr输出信息但仍然成功
      const command = process.platform === 'win32'
        ? 'echo error>&2 & echo success'
        : 'echo "error" >&2; echo "success"'

      const result = await executor.execute(command)

      expect(result.stdout.trim()).to.include('success')
      expect(result.exitCode).to.equal(0)
    })
  })

  describe('超时处理', function() {
    it('应该在超时后终止命令', async function() {
      this.timeout(3000) // 设置测试超时

      const shortTimeout = new CommandExecutor('test-platform', { timeout: 100 })

      // 创建一个会运行较长时间的命令
      const command = process.platform === 'win32'
        ? 'ping -n 10 127.0.0.1'
        : 'sleep 5'

      try {
        await shortTimeout.execute(command)
        expect.fail('应该抛出超时错误')
      } catch (error: any) {
        expect(error).to.be.an('error')
        if (error.code) {
          expect(error.code).to.equal('TIMEOUT')
        }
      }
    })
  })

  describe('输出处理', function() {
    it('应该正确处理大量输出', async function() {
      // 生成大量输出的命令
      const command = process.platform === 'win32'
        ? 'for /L %i in (1,1,10) do @echo Line %i'
        : 'for i in {1..10}; do echo "Line $i"; done'

      const result = await executor.execute(command)

      const lines = result.stdout.trim().split('\n')
      expect(lines.length).to.be.at.least(5) // 至少有一些行
      expect(result.exitCode).to.equal(0)
    })

    it('应该正确处理空输出', async function() {
      const command = process.platform === 'win32' ? 'echo.' : 'true'
      const result = await executor.execute(command)

      expect(result.exitCode).to.equal(0)
    })
  })

  describe('平台特定命令', function() {
    it('应该能够执行平台特定的系统信息命令', async function() {
      let command: string

      switch (process.platform) {
        case 'darwin':
          command = 'uname -s'
          break
        case 'linux':
          command = 'uname -s'
          break
        case 'win32':
          command = 'ver'
          break
        default:
          this.skip()
          return
      }

      const result = await executor.execute(command)

      expect(result.stdout).to.be.a('string')
      expect(result.stdout.length).to.be.greaterThan(0)
      expect(result.exitCode).to.equal(0)
    })
  })

  describe('配置选项', function() {
    it('应该使用自定义配置', async function() {
      const customExecutor = new CommandExecutor('custom-platform', {
        timeout: 1000,
        encoding: 'utf8'
      })

      const command = process.platform === 'win32' ? 'echo test' : 'echo "test"'
      const result = await customExecutor.execute(command)

      expect(result.stdout.trim()).to.equal('test')
      expect(result.platform).to.equal('custom-platform')
    })
  })

  describe('并发执行', function() {
    it('应该能够并发执行多个命令', async function() {
      const commands = [
        process.platform === 'win32' ? 'echo 1' : 'echo "1"',
        process.platform === 'win32' ? 'echo 2' : 'echo "2"',
        process.platform === 'win32' ? 'echo 3' : 'echo "3"'
      ]

      const promises = commands.map(cmd => executor.execute(cmd))
      const results = await Promise.all(promises)

      results.forEach((result, index) => {
        expect(result.stdout.trim()).to.equal((index + 1).toString())
        expect(result.exitCode).to.equal(0)
      })
    })
  })
})
