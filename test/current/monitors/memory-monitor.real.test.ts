import { expect } from 'chai'
import * as os from 'os'
import { OSUtils } from '../../../src'
import { ErrorCode } from '../../../src/types/errors'
import { RealCommandTestBase as Base } from '../real-command-base'
import { ensureMinimumTimeout } from '../../shared/utils/test-base'

describe('Memory Monitor 真实运行时契约', function () {
  let utils: OSUtils
  before(async function () {
    if (!['linux', 'darwin', 'win32'].includes(Base.platform())) this.skip()
    // 监控器以 Node os API 的物理内存总量为基准；受限运行时返回 0 时无法验证真实内存契约。
    if (os.totalmem() <= 0) this.skip()
    await Base.requireRuntimeBaseline(this, { darwin: 'sysctl -n hw.memsize' })
    utils = new OSUtils({ cacheEnabled: false, timeout: 15000 })
  })
  after(function () { utils?.destroy() })

  it('info 应返回非负的内存分量', async function () {
    const info = Base.unwrap<any>(await utils.memory.info(), 'memory.info')
    ;['total', 'used', 'available', 'free', 'cached', 'buffers'].forEach(key => {
      expect(info[key]).to.have.property('toBytes')
      Base.assertNonNegative(info[key].toBytes(), `memory.${key}`)
    })
    Base.assertPercentage(info.usagePercentage, 'memory.usagePercentage')
    expect(info.used.toBytes()).to.be.at.most(info.total.toBytes())
  })

  it('detailed 应保留基本内存数据和 breakdown', async function () {
    const detailed = Base.unwrap<any>(await utils.memory.detailed(), 'memory.detailed')
    expect(detailed.total.toBytes()).to.be.greaterThan(0)
    expect(detailed.breakdown).to.be.an('object')
  })

  it('usage 应与 info 的使用率一致', async function () {
    ensureMinimumTimeout(this, 35000)
    const info = Base.unwrap<any>(await utils.memory.info(), 'memory.info')
    const usage = Base.unwrap<number>(await utils.memory.usage(), 'memory.usage')
    // 两次真实采样之间系统内存会变化，保留 1 个百分点容差而非要求瞬时完全相等。
    expect(usage).to.be.closeTo(info.usagePercentage, 1)
  })

  it('available 应返回有效 DataSize', async function () {
    const available = Base.unwrap<any>(await utils.memory.available(), 'memory.available')
    Base.assertNonNegative(available.toBytes(), 'memory.available')
  })

  it('usedAsync 应返回有效 DataSize', async function () {
    const used = Base.unwrap<any>(await utils.memory.usedAsync(), 'memory.usedAsync')
    Base.assertNonNegative(used.toBytes(), 'memory.used')
  })

  it('total 应与 info 返回的内存总量一致', async function () {
    ensureMinimumTimeout(this, 35000)
    const info = Base.unwrap<any>(await utils.memory.info(), 'memory.info')
    expect(Base.unwrap<any>(await utils.memory.total(), 'memory.total').toBytes()).to.equal(info.total.toBytes())
  })

  it('swap 应返回非负的交换空间字段或明确不支持', async function () {
    const result = await utils.memory.swap()
    if (!result.success) {
      expect(result.error.code).to.equal(ErrorCode.PLATFORM_NOT_SUPPORTED)
      return
    }
    const swap = result.data
    ;['total', 'used', 'free'].forEach(key => Base.assertNonNegative(swap[key].toBytes(), `memory.swap.${key}`))
  })

  it('buffers 应返回有效内存分量', async function () {
    const buffers = Base.unwrap<any>(await utils.memory.buffers(), 'memory.buffers')
    Base.assertNonNegative(buffers.cached.toBytes(), 'memory.cached')
    Base.assertNonNegative(buffers.buffers.toBytes(), 'memory.buffers')
  })

  it('summary 应返回可用聚合数据', async function () {
    const summary = Base.unwrap<any>(await utils.memory.summary(), 'memory.summary')
    expect(summary.total).to.be.a('string').and.not.empty
    Base.assertPercentage(summary.usagePercentage, 'memory.summary.usagePercentage')
  })
})
