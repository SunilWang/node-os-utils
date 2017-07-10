/**
 * author       : Sunil Wang
 * createTime   : 2017/7/9 19:08
 * description  :
 */
var bucket = require('./bucket')

bucket.osCmd = {
  topCpu: bucket.exec('ps -eo pcpu,user,args --no-headers | sort -k 1 -n | tail -n 10 | sort -k 1 -nr | cut -c 1-70'),
  topMem: bucket.exec('ps -eo pmem,pid,cmd | sort -k 1 -n | tail -n 10 | sort -k 1 -nr | cut -c 1-70'),
  vmstats: bucket.exec('vmstat -S m'),
  processesUsers: bucket.exec('ps hax -o user | sort | uniq -c'),
  diskUsage: bucket.exec('df -h'),
  who: bucket.exec('who'),
  whoami: bucket.exec('whoami'),
  openPorts: bucket.exec('lsof -Pni4 | grep ESTABLISHED'),
  ifconfig: bucket.exec('ifconfig')
}
