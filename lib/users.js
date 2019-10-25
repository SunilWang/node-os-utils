/**
 * author       : Sunil Wang
 * createTime   : 2017/7/10 10:17
 * description  :
 */
var bucket = require('./bucket')
var exec = require('./exec')

bucket.users = {
  openedCount: function () {
    return exec('who | grep -v localhost | wc -l')()
      .then(function (count) {
        return Promise.resolve(parseInt(count, 10))
      })
      .catch(function () {
        return Promise.resolve(bucket.options.NOT_SUPPORTED_VALUE)
      })
  }
}
