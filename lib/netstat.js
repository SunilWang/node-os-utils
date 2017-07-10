/**
 * author       : Sunil Wang
 * createTime   : 2017/7/9 22:16
 * description  :
 */
var bucket = require('./bucket')
var cp = require('child_process')

var metrics = {}
var oldStats = []

function createProbe (dev) {
  if (metrics[dev] === null) {
    metrics[dev] = {}

    metrics[dev]['input'] = 0
    metrics[dev]['output'] = 0
  }
}

function getOldStats (dev) {
  for (var i = 0; i < oldStats.length; i++) {
    if (oldStats[i].device === dev) {
      return oldStats[i]
    }
  }
}

var ifconfig = {
  breakIntoBlocks: function breakIntoBlocks (fullText) {
    var blocks = []
    var lines = fullText.split('\n')
    var currentBlock = []
    lines.forEach(function (line) {
      if (line.length > 0 && ['\t', ' '].indexOf(line[0]) === -1 && currentBlock.length > 0) { // start of a new block detected
        blocks.push(currentBlock)
        currentBlock = []
      }
      if (line.trim()) {
        currentBlock.push(line)
      }
    })
    if (currentBlock.length > 0) {
      blocks.push(currentBlock)
    }
    return blocks
  },

  parseSingleBlock: function parseSingleBlock (block) {
    var data = {}
    block.forEach(function (line, i) {
      var match = line.match(/^(\S+)\s+Link/)
      if (i === 0) {
        var match2 = line.match(/([a-zA-Z0-9]+):\s/)
        if (match === null && match2) {
          match = match2
        }
      }
      if (match) { // eth0  Link encap:Ethernet  HWaddr 04:01:d3:db:fd:01
        data.device = match[1] // eth0
        var link = {}
        match = line.match(/encap:(\S+)/)
        if (match) {
          link.encap = match[1]
        }
        match = line.match(/HWaddr\s+(\S+)/)
        if (match) {
          link.hwaddr = match[1]
        }
        data.link = link
      } else {
        var section = data.other || {}
        if ((match = line.match(/collisions:(\S+)/))) {
          section.collisions = parseInt(match[1])
        }
        if ((match = line.match(/txqueuelen:(\S+)/))) {
          section.txqueuelen = parseInt(match[1])
        }
        if ((match = line.match(/RX bytes:(\S+)/))) {
          section.rxBytes = parseInt(match[1])
        }
        if ((match = line.match(/RX packets (\S+) {2}bytes (\S+)/))) {
          section.rxBytes = parseInt(match[2])
        }
        if ((match = line.match(/TX bytes:(\S+)/))) {
          section.txBytes = parseInt(match[1])
        }
        if ((match = line.match(/TX packets (\S+) {2}bytes (\S+)/))) {
          section.txBytes = parseInt(match[2])
        }
        data.other = section
      }
    })
    return data
  }
}

function refreshIfconfig (interval) {
  return new Promise(function (resolve) {
    cp.exec('ifconfig', { shell: true }, function (err, out) {
      if (err) {
        metrics['total']['input'] = bucket.options.NOT_SUPPORTED_VALUE
        metrics['total']['output'] = bucket.options.NOT_SUPPORTED_VALUE
        return resolve(metrics)
      }

      var totalRx = 0
      var totalTx = 0
      var blocks = ifconfig.breakIntoBlocks(out)
      var nbProblems = 0
      var newStats = []
      if (!oldStats) {
        oldStats = blocks
      }
      blocks.forEach(function (block) {
        block = ifconfig.parseSingleBlock(block)
        oldStats.push(block)
        if (block.device !== 'lo' && block.device !== 'lo0' && block.other && block.other.rxBytes > 0 && block.other.txBytes > 0) {
          createProbe(block.device)
          var old = getOldStats(block.device)
          if (old) {
            metrics[block.device]['input'] = (((block.other.rxBytes - old.other.rxBytes) / interval) / 1000000).toFixed(2) + ' MB/s'
            metrics[block.device]['output'] = (((block.other.txBytes - old.other.txBytes) / interval) / 1000000).toFixed(2) + ' MB/s'
            totalRx += block.other.rxBytes - old.other.rxBytes
            totalTx += block.other.txBytes - old.other.txBytes
          }
          newStats.push(block)
        } else {
          nbProblems++
        }
      })
      oldStats = newStats

      // set total
      if (nbProblems === blocks.length) {
        metrics.total['input'] = bucket.options.NOT_SUPPORTED_VALUE
        metrics.total['output'] = bucket.options.NOT_SUPPORTED_VALUE
        return resolve(metrics)
      }

      metrics.total['input'] = ((totalRx / 1000000) / interval).toFixed(2) + ' MB/s'
      metrics.total['output'] = ((totalTx / 1000000) / interval).toFixed(2) + ' MB/s'

      return resolve(metrics)
    })
  })
}

bucket.netstat = {
  info: function (interval) {
    metrics = {}
    metrics['total'] = {}

    return new Promise(function (resolve) {
      cp.exec('ip -s link', { shell: true }, function (err, out) {
        if (err) {
          return refreshIfconfig(interval).then(resolve)
        }

        var names = new RegExp(/[0-9]+: ([\S]+): /g)
        var RX = new RegExp(/ {4}RX: bytes {2}packets {2}errors {2}dropped overrun mcast\s*\n\s*([0-9]+) /gm)
        var TX = new RegExp(/ {4}TX: bytes {2}packets {2}errors {2}dropped carrier collsns \s*\n\s*([0-9]+) /g)

        var stats = []
        var i = 0
        var totalIn = 0
        var totalOut = 0
        var res = null

        while ((res = names.exec(out)) !== null) {
          stats[i++] = {
            interface: res[1]
          }
        }

        i = 0
        while ((res = RX.exec(out)) !== null) {
          stats[i++].inputBytes = res[1]
        }

        i = 0
        while ((res = TX.exec(out)) !== null) {
          stats[i++].outputBytes = res[1]
        }

        for (i = 0; i < stats.length; i++) {
          if (!metrics[stats[i].interface] && stats[i].interface !== 'lo' && stats[i].outputBytes > 0) {
            metrics[stats[i].interface] = {}
            metrics[stats[i].interface]['input'] = 0
            metrics[stats[i].interface]['output'] = 0
          }

          var output = 0
          var input = 0

          if (metrics[stats[i].interface]) {
            if (oldStats && oldStats[i]) {
              output = ((stats[i].outputBytes - oldStats[i].outputBytes) / interval) / 1000000
              input = ((stats[i].inputBytes - oldStats[i].inputBytes) / interval) / 1000000
            }

            metrics[stats[i].interface]['output'] = output.toFixed(2) + 'MB/s'
            metrics[stats[i].interface]['input'] = input.toFixed(2) + 'MB/s'

            totalIn += input
            totalOut += output
          }
        }

        if (stats.length > 0) {
          metrics.total['input'] = totalIn.toFixed(2) + 'MB/s'
          metrics.total['output'] = totalOut.toFixed(2) + 'MB/s'
          totalIn = 0
          totalOut = 0

          return resolve(metrics)
        }
        oldStats = stats
      })
    })
  },
  networkIn: function () {

  },
  networkOut: function () {

  }
}

var co = require('co')

setInterval(function () {
  co(function * () {
    let info = yield bucket.netstat.info()

    console.log(info)
  })
}, 2000)
