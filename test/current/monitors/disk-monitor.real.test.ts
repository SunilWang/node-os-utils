import { expect } from 'chai'
import { OSUtils } from '../../../src'
import { ErrorCode } from '../../../src/types/errors'
import { RealCommandTestBase as Base } from '../real-command-base'
import { ensureMinimumTimeout } from '../../shared/utils/test-base'

describe('Disk Monitor 真实运行时契约', function () {
  let utils: OSUtils
  before(async function () { if (!['linux', 'darwin', 'win32'].includes(Base.platform())) this.skip(); await Base.requireRuntimeBaseline(this, { darwin: 'df -Ph' }); utils = new OSUtils({ cacheEnabled: false, timeout: 15000, disk: { includeStats: true } }) })
  after(function () { utils?.destroy() })

  it('info 应返回至少一个真实磁盘和根挂载点', async function () {
    const info = Base.unwrap<any[]>(await utils.disk.info(), 'disk.info')
    expect(info).to.be.an('array').with.length.greaterThan(0)
    expect(info.some(item => item.mountpoint === '/' || item.mountPoint === '/' || item.mountpoint === 'C:\\')).to.equal(true)
  })

  it('infoByDevice 应能定位 info 中的第一个设备', async function () {
    ensureMinimumTimeout(this, 35000)
    const info = Base.unwrap<any[]>(await utils.disk.info(), 'disk.info')
    const detail = Base.unwrap<any>(await utils.disk.infoByDevice(info[0].device), 'disk.infoByDevice')
    expect(detail?.device).to.equal(info[0].device)
  })

  it('usage 应返回每个磁盘的百分比', async function () {
    const usage = Base.unwrap<any[]>(await utils.disk.usage(), 'disk.usage')
    expect(usage).to.be.an('array').with.length.greaterThan(0)
    usage.forEach(item => Base.assertPercentage(item.usagePercentage, 'disk.usagePercentage'))
  })

  it('usageByMountPoint 应找到 POSIX 根挂载点', async function () {
    const root = Base.unwrap<any>(await utils.disk.usageByMountPoint('/'), 'disk.usageByMountPoint')
    if (Base.platform() !== 'win32') expect(root).to.not.equal(null)
  })

  it('overallUsage 应返回合法聚合百分比', async function () {
    Base.assertPercentage(Base.unwrap<number>(await utils.disk.overallUsage(), 'disk.overallUsage'), 'disk.overallUsage')
  })

  it('spaceOverview 应返回合法聚合百分比', async function () {
    const overview = Base.unwrap<any>(await utils.disk.spaceOverview(), 'disk.spaceOverview')
    Base.assertPercentage(overview.usagePercentage, 'disk.overview.usagePercentage')
    expect(overview.disks).to.be.greaterThan(0)
  })

  it('mounts 应返回真实挂载信息', async function () {
    expect(Base.unwrap<any[]>(await utils.disk.mounts(), 'disk.mounts')).to.be.an('array').with.length.greaterThan(0)
  })

  it('stats 应遵循能力契约', async function () {
    if (Base.platform() === 'darwin') await Base.requireRuntimeBaseline(this, { darwin: 'iostat -d' })
    const stats = await utils.disk.stats()
    expect(stats.success || (!stats.success && stats.error.code === ErrorCode.PLATFORM_NOT_SUPPORTED)).to.equal(true)
  })

  it('healthCheck 应返回磁盘健康状态', async function () {
    const health = Base.unwrap<any>(await utils.disk.healthCheck(), 'disk.healthCheck')
    expect(health.status).to.be.oneOf(['healthy', 'warning', 'critical'])
    expect(health.issues).to.be.an('array')
  })

  it('filesystems 应返回数组，或因直接依赖命令受限而明确跳过', async function () {
    if (Base.platform() === 'darwin') await Base.requireRuntimeBaseline(this, { darwin: 'diskutil list' })
    const result = await utils.disk.filesystems()
    expect(result.success).to.equal(true)
    if (result.success) expect(result.data).to.be.an('array')
  })
})
