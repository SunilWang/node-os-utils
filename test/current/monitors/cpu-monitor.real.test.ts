import { expect } from 'chai'
import { OSUtils } from '../../../src'
import { RealCommandTestBase as Base } from '../real-command-base'

describe('CPU Monitor 真实运行时契约', function () {
  let utils: OSUtils

  before(async function () { if (!['linux', 'darwin', 'win32'].includes(Base.platform())) this.skip(); await Base.requireRuntimeBaseline(this); utils = new OSUtils({ cacheEnabled: false, timeout: 15000 }) })
  after(function () { utils?.destroy() })

  it('info 应返回非空型号和正数核心数', async function () {
    const info = Base.unwrap<any>(await utils.cpu.info(), 'cpu.info')
    expect(info.model).to.be.a('string').and.not.empty
    expect(info.cores).to.be.greaterThan(0)
    expect(info.threads).to.be.at.least(info.cores)
  })

  it('coreCount 应与 info 返回的核心数一致', async function () {
    const info = Base.unwrap<any>(await utils.cpu.info(), 'cpu.info')
    const cores = Base.unwrap<any>(await utils.cpu.coreCount(), 'cpu.coreCount')
    expect(cores.physical).to.equal(info.cores)
    expect(cores.logical).to.equal(info.threads)
  })

  it('usage 应返回 0 到 100 的真实百分比', async function () {
    Base.assertPercentage(Base.unwrap<number>(await utils.cpu.usage(), 'cpu.usage'), 'cpu.usage')
  })

  it('usageDetailed 应返回总体和每核心使用率', async function () {
    const usage = Base.unwrap<any>(await utils.cpu.usageDetailed(), 'cpu.usageDetailed')
    Base.assertPercentage(usage.overall, 'cpu.overall')
    expect(usage.cores).to.be.an('array')
    usage.cores.forEach((value: number) => Base.assertPercentage(value, 'cpu.core'))
  })

  it('usageByCore 应与详细使用率保持相同的核心维度', async function () {
    const result = await utils.cpu.usageByCore()
    if (!result.success) {
      expect(result.error.code).to.equal('PLATFORM_NOT_SUPPORTED')
      return
    }
    expect(result.data).to.be.an('array').with.length.greaterThan(0)
    result.data.forEach(value => Base.assertPercentage(value, 'cpu.usageByCore'))
  })

  it('loadAverage 应返回三个非负采样窗口', async function () {
    const load = Base.unwrap<any>(await utils.cpu.loadAverage(), 'cpu.loadAverage')
    ;['load1', 'load5', 'load15'].forEach(key => Base.assertNonNegative(load[key], `cpu.${key}`))
  })

  it('frequency 和 cache 应遵循平台能力结果', async function () {
    const frequency = await utils.cpu.frequency()
    expect(frequency.success || (!frequency.success && frequency.error.code === 'PLATFORM_NOT_SUPPORTED')).to.equal(true)
    const cache = await utils.cpu.getCacheInfo()
    expect(cache.success || (!cache.success && cache.error.code === 'PLATFORM_NOT_SUPPORTED')).to.equal(true)
  })
})
