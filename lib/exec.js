/**
 * author       : Sunil Wang
 * createTime   : 2019/10/25 10:36
 * description  :
 */
var cp = require('child_process')
var bucket = require('./bucket')

module.exports = function (command) {
  return function () {
    return new Promise(function (resolve) {
      cp.exec(command, { shell: true }, function (err, stdout, stderr) {
        if (err || !stdout) {
          return resolve(bucket.options.NOT_SUPPORTED_VALUE)
        }

        return resolve(stdout)
      })
    })
  }
}
