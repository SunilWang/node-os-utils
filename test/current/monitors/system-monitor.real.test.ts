import { expect } from 'chai'
import * as os from 'os'
import { OSUtils } from '../../../src'
import { ErrorCode } from '../../../src/types/errors'
import { RealCommandTestBase as Base } from '../real-command-base'

describe('System Monitor 真实运行时契约', function () {
  let utils: OSUtils
  before(async function () { if (!['linux', 'darwin', 'win32'].includes(Base.platform())) this.skip(); await Base.requireRuntimeBaseline(this, { darwin: 'sysctl -n vm.loadavg' }); utils = new OSUtils({ cacheEnabled: false, timeout: 15000, system: { includeUsers: true } }) })
  after(function () { utils?.destroy() })

  it('info 应与 Node os API 保持平台和主机信息一致', async function () {
    const info = Base.unwrap<any>(await utils.system.info(), 'system.info')
    expect(info.platform).to.equal(Base.platform())
    expect(info.hostname).to.equal(os.hostname())
    expect(info.arch).to.equal(os.arch())
  })

  it('uptime 应与 Node os.uptime 保持合理误差', async function () {
    const uptime = Base.unwrap<any>(await utils.system.uptime(), 'system.uptime')
    expect(uptime.uptime).to.be.greaterThan(0)
    expect(Math.abs(uptime.uptime / 1000 - os.uptime())).to.be.lessThan(120)
  })

  it('load 应返回三个非负采样窗口', async function () {
    const load = Base.unwrap<any>(await utils.system.load(), 'system.load')
    ;['load1', 'load5', 'load15'].forEach(key => Base.assertNonNegative(load[key], `system.${key}`))
  })

  it('users 应返回用户数组或 Windows 明确不支持', async function () {
    const users = await utils.system.users()
    if (Base.platform() === 'win32') expect(users.success).to.equal(false)
    else expect(Base.unwrap<any[]>(users, 'system.users')).to.be.an('array')
  })

  it('services 应返回数组或明确能力错误', async function () {
    const services = await utils.system.services()
    expect(services.success || (!services.success && services.error.code === ErrorCode.PLATFORM_NOT_SUPPORTED)).to.equal(true)
    if (services.success) expect(services.data).to.be.an('array')
  })

  it('time 应返回合理时间戳和 ISO 字符串', async function () {
    const time = Base.unwrap<any>(await utils.system.time(), 'system.time')
    expect(time.current).to.be.a('number').and.greaterThan(0)
    expect(new Date(time.current).getTime()).to.equal(time.current)
  })

  it('overview 应返回聚合信息', async function () {
    const overview = Base.unwrap<any>(await utils.system.overview(), 'system.overview')
    expect(overview).to.have.property('system')
  })

  it('healthCheck 应返回聚合健康状态', async function () {
    const health = Base.unwrap<any>(await utils.system.healthCheck(), 'system.healthCheck')
    expect(health.status).to.be.oneOf(['healthy', 'warning', 'critical'])
  })
})
