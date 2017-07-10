/**
 * author       : Sunil Wang
 * createTime   : 2017/7/9 19:24
 * description  :
 */
var cp = require('child_process')

module.exports = {
  options: {
    NOT_SUPPORTED_VALUE: 'not supported',
    INTERVAL: 1000
  },
  exec: function (command) {
    var self = this

    return function () {
      return new Promise(function (resolve, reject) {
        cp.exec(command, { shell: true }, function (err, stdout, stderr) {
          if (err || !stdout) {
            return reject(self.options.NOT_SUPPORTED_VALUE)
          }

          return resolve(stdout)
        })
      })
    }
  }
}
