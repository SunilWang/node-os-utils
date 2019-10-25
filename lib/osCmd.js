/**
 * author       : Sunil Wang
 * createTime   : 2017/7/9 19:08
 * description  :
 */
var bucket = require('./bucket')
var exec = require('./exec')

bucket.osCmd = {
  topCpu: exec('ps -eo pcpu,user,args --no-headers | sort -k 1 -n | tail -n 10 | sort -k 1 -nr | cut -c 1-70'),
  topMem: exec('ps -eo pmem,pid,cmd | sort -k 1 -n | tail -n 10 | sort -k 1 -nr | cut -c 1-70'),
  vmstats: exec('vmstat -S m'),
  processesUsers: exec('ps hax -o user | sort | uniq -c'),
  diskUsage: exec('df -h'),
  who: exec('who'),
  whoami: exec('whoami'),
  openPorts: exec('lsof -Pni4 | grep ESTABLISHED'),
  ifconfig: exec('ifconfig')
}
