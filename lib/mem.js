/**
 * author       : Sunil Wang
 * createTime   : 2017/7/9 21:49
 * description  :
 */
var bucket = require('./bucket')
var os = require('os')
var fs = require('fs')
var co = require('../util/co')
var exec = require('./exec')

// https://github.com/SunilWang/node-os-utils/pull/11
// running this on an embedded linux device. This steps takes around 500ms. With this change we brought it down to a few milliseconds.
var getMeminfo = function () {
  return new Promise(function (resolve) {
    fs.readFile('/proc/meminfo', 'utf8', function (err, out) {
      if (err) {
        return resolve(bucket.options.NOT_SUPPORTED_VALUE)
      }
      const memInfo = {}
      const usage = out.toString().trim().split('\n')
      usage.forEach((line) => {
        const pair = line.split(':')
        memInfo[pair[0]] = parseInt(pair[1], 10)
      })

      return resolve(memInfo)
    })
  })
}

var darwinMem = {
  PAGE_SIZE: 4096,
  physicalMemory: co.wrap(function* () {
    var res = yield exec('sysctl hw.memsize')
    res = res.trim().split(' ')[1]
    return parseInt(res)
  }),
  vmStats: co.wrap(function* () {
    var mappings = {
      'Anonymous pages': 'app',
      'Pages wired down': 'wired',
      'Pages active': 'active',
      'Pages inactive': 'inactive',
      'Pages occupied by compressor': 'compressed',
    }

    var ret = {}
    var res = yield exec('vm_stat')
    var lines = res.split('\n')

    lines = lines.filter((x) => x !== '')

    lines.forEach((x) => {
      var parts = x.split(':')
      var key = parts[0]
      var val = parts[1].replace('.', '').trim()

      if (mappings[key]) {
        var k = mappings[key]

        ret[k] = val * darwinMem.PAGE_SIZE
      }
    })
    return ret
  }),
  memory: co.wrap(function* () {
    var total = yield darwinMem.physicalMemory()
    var stats = yield darwinMem.vmStats()
    // This appears to be contested
    // not clear what apple is using for "Memory Used" in app
    var used = stats.wired + stats.active + stats.inactive
    return { used: used, total: total }
  }),
}

bucket.mem = {
  info: co.wrap(function* () {
    var totalMem = null
    var freeMem = null
    var memInfo = yield getMeminfo()

    if (bucket.isNotSupported(memInfo)) {
      totalMem = os.totalmem() / 1024
      freeMem = os.freemem() / 1024
      if (os.platform() === 'darwin') {
        var mem = yield darwinMem.memory()

        totalMem = mem.total
        freeMem = mem.total - mem.used
      }
    } else {
      var totalMem = parseInt(memInfo.MemTotal, 10) * 1024
      freeMem = memInfo.MemAvailable * 1024

      // https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=34e431b0ae398fc54ea69ff85ec700722c9da773
      // https://www.cnblogs.com/johnnyzen/p/8011309.html
      if (os.release() < '3.14') {
        freeMem =
          ((memInfo.MemFree || 0) +
            (memInfo.Buffers || 0) +
            (memInfo.Cached || 0)) *
          1024
      }
    }

    var totalMemMb = parseFloat((totalMem / 1024 / 1024).toFixed(2))
    var usedMemMb = parseFloat(((totalMem - freeMem) / 1024 / 1024).toFixed(2))
    var freeMemMb = parseFloat((totalMemMb - usedMemMb).toFixed(2))
    var freeMemPercentage = parseFloat((100 * (freeMem / totalMem)).toFixed(2))

    return {
      totalMemMb: totalMemMb,
      usedMemMb: usedMemMb,
      freeMemMb: freeMemMb,
      freeMemPercentage: freeMemPercentage,
    }
  }),
  free: function () {
    var self = this

    return self.info().then(function (res) {
      return Promise.resolve({
        totalMemMb: res.totalMemMb,
        freeMemMb: res.freeMemMb,
      })
    })
  },
  used: function () {
    var self = this

    return self.info().then(function (res) {
      return Promise.resolve({
        totalMemMb: res.totalMemMb,
        usedMemMb: res.usedMemMb,
      })
    })
  },
  totalMem: function () {
    return os.totalmem()
  },
}
