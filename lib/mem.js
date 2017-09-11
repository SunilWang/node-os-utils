/**
 * author       : Sunil Wang
 * createTime   : 2017/7/9 21:49
 * description  :
 */
var bucket = require('./bucket')
var cp = require('child_process')
var os = require('os')
var co = require('../util/co')

var darwinMem = {
  PAGE_SIZE: 4096,
  physicalMemory: co.wrap(function * () {
    var res = yield (bucket.exec('sysctl hw.memsize')())
    res = res.trim().split(' ')[1]
    return parseInt(res)
  }),
  vmStats: co.wrap(function * () {
    var mappings = {
      'Anonymous pages': 'app',
      'Pages wired down': 'wired',
      'Pages active': 'active',
      'Pages inactive': 'inactive',
      'Pages occupied by compressor': 'compressed'
    }

    var ret = {}
    var res = yield (bucket.exec('vm_stat')())
    var lines = res.split('\n')

    lines = lines.filter(x => x !== '')

    lines.forEach(x => {
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
  memory: co.wrap(function * () {
    var total = yield darwinMem.physicalMemory()
    var stats = yield darwinMem.vmStats()
    // This appears to be contested
    // not clear what apple is using for "Memory Used" in app
    var used = (stats.wired + stats.active + stats.inactive)
    return { used: used, total: total }
  })
}

bucket.mem = {
  info: function () {
    return new Promise(function (resolve) {
      var totalMem = null
      var freeMem = null

      cp.exec('cat /proc/meminfo | head -5', co.wrap(function * (err, out) {
        if (err || !out) {
          totalMem = os.totalmem() / 1024
          freeMem = os.freemem() / 1024
          if (os.platform() === 'darwin') {
            var mem = yield darwinMem.memory()

            totalMem = mem.total
            freeMem = mem.total - mem.used
          }
        } else {
          var resultMemory = (out.match(/\d+/g))

          totalMem = parseInt(resultMemory[0], 10) * 1024
          freeMem = parseInt(resultMemory[1], 10) + (parseInt(resultMemory[3], 10) + parseInt(resultMemory[4], 10)) * 1024
        }

        var totalMemMb = parseFloat((totalMem / 1024 / 1024).toFixed(2))
        var usedMemMb = parseFloat(((totalMem - freeMem) / 1024 / 1024).toFixed(2))
        var freeMemMb = parseFloat((totalMemMb - usedMemMb).toFixed(2))
        var freeMemPercentage = parseFloat((100 * (freeMem / totalMem)).toFixed(2))

        return resolve({
          totalMemMb: totalMemMb,
          usedMemMb: usedMemMb,
          freeMemMb: freeMemMb,
          freeMemPercentage: freeMemPercentage
        })
      }))
    })
  },
  free: function () {
    var self = this

    return self.info().then(function (res) {
      return Promise.resolve({
        totalMemMb: res.totalMemMb,
        freeMemMb: res.freeMemMb
      })
    })
  },
  used: function () {
    var self = this

    return self.info().then(function (res) {
      return Promise.resolve({
        totalMemMb: res.totalMemMb,
        usedMemMb: res.usedMemMb
      })
    })
  },
  totalMem: function () {
    return os.totalmem()
  }
}
