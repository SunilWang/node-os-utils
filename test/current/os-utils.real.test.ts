import { expect } from 'chai'
import { OSUtils, createOSUtils } from '../../src'
import { RealCommandTestBase } from './real-command-base'

describe('OSUtils 真实平台聚合测试', function() {
  let utils: OSUtils

  before(async function() {
    if (!['linux', 'darwin', 'win32'].includes(RealCommandTestBase.platform())) this.skip()
    await RealCommandTestBase.requireRuntimeBaseline(this)
    utils = new OSUtils({ cacheEnabled: false, timeout: 15000 })
  })

  after(function() {
    utils?.destroy()
  })

  it('应返回当前平台信息且能力声明与平台一致', function() {
    const info = utils.getPlatformInfo()
    expect(info.platform).to.equal(RealCommandTestBase.platform())
    expect(info.supported).to.be.true
    expect(info.arch).to.be.a('string').and.not.empty
  })

  it('应通过真实适配器完成 overview 聚合', async function() {
    this.timeout(30000)
    const result = await utils.overview()
    expect(result).to.have.property('system')
    expect(result).to.have.property('cpu')
    expect(result).to.have.property('memory')
    expect(result).to.have.property('disk')
    expect(result).to.have.property('network')
    expect(result).to.have.property('processes')
    expect(result.system, 'system 不应静默降级为空').to.not.equal(null)
    expect(result.cpu.usage, 'cpu 不应静默降级为空').to.be.a('number')
    expect(result.memory, 'memory 不应静默降级为空').to.not.equal(null)
    expect(result.disk, 'disk 不应静默降级为空').to.not.equal(null)
    expect(result.network, 'network 不应静默降级为空').to.not.equal(null)
    expect(result.processes, 'processes 不应静默降级为空').to.not.equal(null)
  })

  it('应返回支持的平台列表且包含当前平台', function () {
    expect(utils.getSupportedPlatforms()).to.include(RealCommandTestBase.platform())
  })

  it('六个 Monitor getter 应惰性创建并复用实例', function () {
    expect(utils.cpu).to.equal(utils.cpu)
    expect(utils.memory).to.equal(utils.memory)
    expect(utils.disk).to.equal(utils.disk)
    expect(utils.network).to.equal(utils.network)
    expect(utils.process).to.equal(utils.process)
    expect(utils.system).to.equal(utils.system)
  })

  it('工厂函数应创建当前平台的 OSUtils 实例', function () {
    const instance = createOSUtils({ cacheEnabled: false })
    expect(instance.getPlatformInfo().platform).to.equal(RealCommandTestBase.platform())
    instance.destroy()
  })

  it('启用缓存时真实调用应产生命中统计', async function () {
    const cached = new OSUtils({ cacheEnabled: true, cacheTTL: 5000 })
    try {
      expect((await cached.cpu.info()).success).to.equal(true)
      expect((await cached.cpu.info()).success).to.equal(true)
      expect(cached.getCacheStats().hits).to.be.greaterThan(0)
    } finally { cached.destroy() }
  })

  it('禁用缓存时真实调用不应产生缓存项', async function () {
    const uncached = new OSUtils({ cacheEnabled: false })
    try {
      expect((await uncached.cpu.info()).success).to.equal(true)
      expect(uncached.getCacheStats().size).to.equal(0)
    } finally { uncached.destroy() }
  })

  it('configureCache 应重建缓存并保留真实监控能力', async function () {
    const before = utils.cpu
    utils.configureCache({ maxSize: 20, defaultTTL: 200 })
    expect(utils.cpu).to.not.equal(before)
    expect((await utils.cpu.info()).success).to.equal(true)
    expect(utils.getCacheStats().maxSize).to.equal(20)
  })

  it('configureCache 应切换缓存开关', function () {
    utils.configureCache({ enabled: false })
    expect(utils.getCacheStats().size).to.equal(0)
    utils.configureCache({ enabled: true })
  })

  it('clearCache 应清理真实监控缓存', async function () {
    utils.configureCache({ enabled: true })
    expect((await utils.cpu.info()).success).to.equal(true)
    expect(utils.getCacheStats().size).to.be.greaterThan(0)
    utils.clearCache()
    expect(utils.getCacheStats().size).to.equal(0)
  })

  it('setDebug 应更新调试配置且不改变平台信息', function () {
    expect(utils.setDebug(true)).to.equal(utils)
    expect(utils.getPlatformInfo().platform).to.equal(RealCommandTestBase.platform())
    utils.setDebug(false)
  })

  it('healthCheck 应包含各资源详情或明确的失败降级', async function () {
    const result = await utils.healthCheck()
    expect(result.details).to.have.keys(['system', 'disk', 'network'])
    expect(result.timestamp).to.be.a('number').and.greaterThan(0)
  })

  it('destroy 后新实例应拥有隔离的缓存和监控器', async function () {
    const old = new OSUtils({ cacheEnabled: true })
    await old.cpu.info()
    old.destroy()
    const fresh = new OSUtils({ cacheEnabled: true })
    try {
      expect(fresh.getCacheStats().size).to.equal(0)
      expect((await fresh.cpu.info()).success).to.equal(true)
    } finally { fresh.destroy() }
  })

  it('应通过真实系统信息完成 healthCheck', async function() {
    this.timeout(30000)
    const result = await utils.healthCheck()
    expect(result.status).to.be.oneOf(['healthy', 'warning', 'critical'])
    expect(result.issues).to.be.an('array')
  })

  it('应暴露能力检查、缓存管理和销毁 API', async function() {
    const capabilities = await utils.checkPlatformCapabilities()
    expect(capabilities.platform).to.equal(RealCommandTestBase.platform())
    expect(capabilities.capabilities.features).to.be.an('array')
    utils.clearCache()
    const before = utils.getCacheStats()
    expect(before.size).to.equal(0)
    utils.clearCache()
    expect(utils.getCacheStats().size).to.equal(0)
    utils.destroy()
  })
})
