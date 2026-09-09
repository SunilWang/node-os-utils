import { expect } from 'chai'
import { OSUtils } from '../../../src'
import { ErrorCode } from '../../../src/types/errors'
import { RealCommandTestBase as Base } from '../real-command-base'

describe('Process Monitor 真实运行时契约', function () {
  let utils: OSUtils
  before(async function () { if (!['linux', 'darwin', 'win32'].includes(Base.platform())) this.skip(); await Base.requireRuntimeBaseline(this, { darwin: 'ps -p $$' }); utils = new OSUtils({ cacheEnabled: false, timeout: 15000, process: { includeChildren: true } }) })
  after(function () { utils?.destroy() })

  it('current 和 byPid 应返回当前 Node 进程', async function () {
    const current = Base.unwrap<any>(await utils.process.current(), 'process.current')
    expect(current).to.not.equal(null)
    expect(current.pid).to.equal(process.pid)
    const byPid = Base.unwrap<any>(await utils.process.byPid(process.pid), 'process.byPid')
    expect(byPid?.pid).to.equal(process.pid)
  })

  it('exists 应识别当前 PID 和不存在 PID', async function () {
    expect(Base.unwrap<boolean>(await utils.process.exists(process.pid), 'process.exists')).to.equal(true)
    expect(Base.unwrap<boolean>(await utils.process.exists(99999999), 'process.exists.missing')).to.equal(false)
  })

  it('stats 应返回进程总数和内存聚合', async function () {
    const stats = Base.unwrap<any>(await utils.process.stats(), 'process.stats')
    expect(stats.total).to.be.greaterThan(0)
  })

  it('list 和 info 应返回完整进程字段', async function () {
    const list = Base.unwrap<any[]>(await utils.process.list(), 'process.list')
    expect(list).to.be.an('array').with.length.greaterThan(0)
    expect(list[0]).to.include.keys(['pid', 'ppid', 'name', 'command', 'state', 'cpuUsage', 'memoryUsage', 'memoryPercentage'])
    const info = Base.unwrap<any[]>(await utils.process.info(), 'process.info')
    expect(info).to.be.an('array')
  })

  it('byName 和排序查询应返回数组', async function () {
    expect(Base.unwrap<any[]>(await utils.process.byName('node'), 'process.byName')).to.be.an('array')
    expect(Base.unwrap<any[]>(await utils.process.topByCpu(3), 'process.topByCpu')).to.be.an('array')
    expect(Base.unwrap<any[]>(await utils.process.topByMemory(3), 'process.topByMemory')).to.be.an('array')
  })

  it('environment 和 openFiles 应遵循启用能力契约', async function () {
    const env = await utils.process.environment(process.pid)
    expect(env.success).to.equal(false)
    const files = await utils.process.openFiles(process.pid)
    expect(files.success).to.equal(false)
  })

  it('children、tree 和 kill 非法 PID 应返回安全结果', async function () {
    expect(Base.unwrap<any[]>(await utils.process.children(process.pid), 'process.children')).to.be.an('array')
    const tree = await utils.process.tree(process.pid)
    expect(tree.success || (!tree.success && tree.error.code === ErrorCode.PLATFORM_NOT_SUPPORTED)).to.equal(true)
    const result = Base.unwrap<boolean>(await utils.process.kill(-1), 'process.kill')
    expect(result).to.equal(false)
  })
})
