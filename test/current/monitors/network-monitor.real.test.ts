import { expect } from 'chai'
import { OSUtils } from '../../../src'
import { RealCommandTestBase as Base } from '../real-command-base'

describe('Network Monitor 真实运行时契约', function () {
  let utils: OSUtils
  before(async function () { if (!['linux', 'darwin', 'win32'].includes(Base.platform())) this.skip(); await Base.requireRuntimeBaseline(this, { darwin: 'ifconfig' }); utils = new OSUtils({ cacheEnabled: false, timeout: 15000, network: { includeConnections: true, includeBandwidth: true, bandwidthInterval: 50 } }) })
  after(function () { utils?.destroy() })

  it('interfaces 应返回至少一个真实接口', async function () {
    const interfaces = Base.unwrap<any[]>(await utils.network.interfaces(), 'network.interfaces')
    expect(interfaces).to.be.an('array').with.length.greaterThan(0)
    interfaces.forEach(item => expect(item.name).to.be.a('string').and.not.empty)
  })

  it('interfaceByName 应能查询已返回的接口', async function () {
    const interfaces = Base.unwrap<any[]>(await utils.network.interfaces(), 'network.interfaces')
    const detail = Base.unwrap<any>(await utils.network.interfaceByName(interfaces[0].name), 'network.interfaceByName')
    expect(detail?.name).to.equal(interfaces[0].name)
  })

  it('statsAsync 应返回非负流量计数', async function () {
    const stats = Base.unwrap<any[]>(await utils.network.statsAsync(), 'network.stats')
    expect(stats).to.be.an('array')
    stats.forEach(item => {
      expect(item.interface).to.be.a('string').and.not.empty
      ;['rxBytes', 'txBytes'].forEach(key => Base.assertNonNegative(item[key].toBytes(), `network.${key}`))
      ;['rxPackets', 'txPackets'].forEach(key => Base.assertNonNegative(item[key], `network.${key}`))
    })
  })

  it('statsByInterface 应遵循接口名称查询契约', async function () {
    const stats = Base.unwrap<any[]>(await utils.network.statsAsync(), 'network.stats')
    const detail = Base.unwrap<any>(await utils.network.statsByInterface(stats[0]?.interface || 'missing'), 'network.statsByInterface')
    expect(detail === null || detail.interface === stats[0]?.interface).to.equal(true)
  })

  it('gateway 应返回网关对象或空值', async function () {
    if (Base.platform() === 'darwin') await Base.requireRuntimeBaseline(this, { darwin: 'route -n get default' })
    const result = await utils.network.gateway()
    expect(result.success).to.equal(true)
    if (result.success) expect(result.data === null || typeof result.data === 'object').to.equal(true)
  })

  it('connections、bandwidth 和 healthCheck 应返回可诊断结果', async function () {
    const connections = await utils.network.connections()
    expect(connections.success || connections.error.code === 'PLATFORM_NOT_SUPPORTED').to.equal(true)
    const bandwidthResult = await utils.network.bandwidth()
    expect(bandwidthResult.success || bandwidthResult.error.code === 'PLATFORM_NOT_SUPPORTED').to.equal(true)
    if (bandwidthResult.success) {
      expect(bandwidthResult.data.interfaces).to.be.an('array')
      bandwidthResult.data.interfaces.forEach((item: any) => { Base.assertNonNegative(item.rxSpeed, 'network.rxSpeed'); Base.assertNonNegative(item.txSpeed, 'network.txSpeed') })
    }
    const health = Base.unwrap<any>(await utils.network.healthCheck(), 'network.healthCheck')
    expect(health.status).to.be.oneOf(['healthy', 'warning', 'critical'])
  })

  it('overview 应包含接口、统计和连接聚合字段', async function () {
    const overview = Base.unwrap<any>(await utils.network.overview(), 'network.overview')
    expect(overview).to.include.keys(['interfaces', 'activeInterfaces', 'totalRxBytes', 'totalTxBytes', 'totalPackets', 'totalErrors'])
  })
})
