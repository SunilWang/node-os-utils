import { expect } from 'chai'
import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

interface RunnerFixture {
  root: string
  scriptPath: string
}

const temporaryPaths: string[] = []

/**
 * 创建隔离的测试运行器仓库骨架。
 *
 * @returns 临时仓库根目录和已复制的运行器路径
 * @throws 临时目录或运行器文件创建失败时抛出文件系统异常
 */
function createRunnerFixture(): RunnerFixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'node-os-utils-test-runner-'))
  const scriptDirectory = path.join(root, 'scripts')
  const sourceScript = path.resolve(__dirname, '../../../../scripts/test-runner.js')
  const scriptPath = path.join(scriptDirectory, 'test-runner.js')

  temporaryPaths.push(root)
  fs.mkdirSync(scriptDirectory, { recursive: true })
  fs.copyFileSync(sourceScript, scriptPath)

  return { root, scriptPath }
}

/**
 * 为隔离仓库添加一个已编译测试和最小 Mocha 入口。
 *
 * @param root 隔离仓库根目录
 * @returns void
 * @throws 测试或 Mocha 占位文件创建失败时抛出文件系统异常
 */
function addRunnableCompiledTest(root: string): void {
  const sharedTestDirectory = path.join(root, 'dist', 'test', 'shared')
  const mochaDirectory = path.join(root, 'node_modules', 'mocha', 'bin')

  fs.mkdirSync(sharedTestDirectory, { recursive: true })
  fs.mkdirSync(mochaDirectory, { recursive: true })
  fs.writeFileSync(path.join(sharedTestDirectory, 'fixture.test.js'), '')
  fs.writeFileSync(path.join(mochaDirectory, 'mocha.js'), '')
}

describe('test-runner', function() {
  afterEach(function() {
    for (const target of temporaryPaths.splice(0)) {
      fs.rmSync(target, { recursive: true, force: true })
    }
  })

  it('应从非仓库 cwd 按运行器所在仓库定位已编译测试', function() {
    const fixture = createRunnerFixture()
    const foreignCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'node-os-utils-foreign-cwd-'))
    temporaryPaths.push(foreignCwd)
    addRunnableCompiledTest(fixture.root)

    const result = spawnSync(process.execPath, [fixture.scriptPath, 'all'], {
      cwd: foreignCwd,
      encoding: 'utf8'
    })

    expect(result.status, result.stderr).to.equal(0)
    expect(result.stdout).to.include('[test-runner] 运行分组 shared（1 个文件）')
    // 只要总数非零，单个可选分组缺失应明确跳过而不是误报失败。
    expect(result.stdout).to.include('[test-runner] current: 无已编译测试文件，跳过')
  })

  it('所有选定分组都没有已编译测试时应以非零状态退出', function() {
    const fixture = createRunnerFixture()
    const result = spawnSync(process.execPath, [fixture.scriptPath, 'all'], {
      cwd: os.tmpdir(),
      encoding: 'utf8'
    })

    expect(result.status).to.equal(1)
    expect(result.stderr).to.include(`${path.join(fixture.root, 'dist', 'test')}: 所有选定分组均无已编译测试文件`)
  })
})
