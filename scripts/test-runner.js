const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

// Node 平台 → 系统目录名
const platformMap = { linux: 'linux', darwin: 'macos', win32: 'windows' }

// 每个系统目录（按系统分组的真实测试）
const systemDirs = ['linux', 'macos', 'windows']
// 任意平台都要跑的基础目录
const baseDirs = ['shared', 'current']
// 已编译测试始终相对于仓库根目录定位，不依赖调用方的 cwd。
const compiledTestsRoot = path.resolve(__dirname, '..', 'dist', 'test')

/**
 * 获取当前运行时对应的系统目录名。
 *
 * @returns {string} 系统目录名
 */
function getCurrentSystemDir() {
  const dir = platformMap[process.platform]
  if (!dir) throw new Error(`不支持的平台: ${process.platform}`)
  return dir
}

/**
 * 递归收集 dist/test 下某个目录里所有已编译测试文件。
 *
 * @param {string} dir 相对 dist/test 的目录名
 * @returns {string[]} 已编译测试文件路径列表
 */
function collectCompiledTests(dir) {
  const absRoot = path.join(compiledTestsRoot, dir)
  if (!fs.existsSync(absRoot)) return []

  const files = []
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
        files.push(full)
      }
    }
  }
  walk(absRoot)
  return files
}

/**
 * 根据命令参数确定要跑的目录分组。
 *
 * @param {string} target 命令目标（all/platform/current/linux/macos/windows）
 * @returns {string[]} 目录分组列表
 */
function resolveGroups(target) {
  if (target === 'all' || target === 'platform' || target === 'current') {
    return [...baseDirs, getCurrentSystemDir()]
  }
  if (systemDirs.includes(target)) {
    return [...baseDirs, target]
  }
  throw new Error(`未知测试目标: ${target}`)
}

/**
 * 执行 Mocha 测试。
 *
 * @param {string[]} files 已编译测试文件路径
 * @param {number | undefined} timeout 测试超时时间（毫秒）；真实命令分组需要覆盖 Mocha 默认 2 秒
 * @returns {void}
 */
function runMocha(files, timeout) {
  const mochaEntry = require.resolve('mocha/bin/mocha')
  const args = timeout === undefined
    ? [mochaEntry, ...files]
    : [mochaEntry, '--timeout', String(timeout), ...files]
  execFileSync(process.execPath, args, { stdio: 'inherit' })
}

const [target = 'all'] = process.argv.slice(2)
const groups = resolveGroups(target)
const groupedTests = groups.map(group => ({
  group,
  files: collectCompiledTests(group)
}))
const totalFiles = groupedTests.reduce((total, entry) => total + entry.files.length, 0)

if (totalFiles === 0) {
  // 单个分组可以合法缺失，但所有选定分组都为空时必须失败，避免“零测试”假绿。
  console.error(`[test-runner] ${compiledTestsRoot}: 所有选定分组均无已编译测试文件`)
  process.exitCode = 1
} else {
  for (const { group, files } of groupedTests) {
    if (files.length === 0) {
      console.log(`[test-runner] ${group}: 无已编译测试文件，跳过`)
      continue
    }
    console.log(`[test-runner] 运行分组 ${group}（${files.length} 个文件）`)
    // shared 在高负载 CI 上也可能被调度暂停；真实命令分组则需要覆盖 PowerShell/WMI 冷启动。
    runMocha(files, group === 'shared' ? 10000 : 30000)
  }
}
